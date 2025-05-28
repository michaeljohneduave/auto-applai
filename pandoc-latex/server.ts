import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify, { type FastifyRequest } from "fastify";

const fastify = Fastify({
  logger: {
    level: "debug"
  },
});

interface CompileBody {
  latex: string;
}

fastify.addHook('onRequest', (request, reply, done) => {
  fastify.log.debug(`Incoming request: ${request.method} ${request.url}`);
  done(); // Must call done() to continue the request lifecycle
});

fastify.post( "/compile", async function handler(req: FastifyRequest<{ Body: CompileBody }>, reply) {
  const body = req.body;

  if (!body.latex) {
    return reply.status(400).send({
      error: "Missing latex in request body"
    });
  }

  const latexSource = body.latex;
  let tempDir = "";
  let inputTexPath: string;
  let outputPdfPath: string;
  let logFilePath: string;

  try {
    // Create a unique temporary directory for this request
    // This helps avoid conflicts if multiple requests are processed concurrently
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'latex-compile-'));

    inputTexPath = path.join(tempDir, 'input.tex');
    outputPdfPath = path.join(tempDir, 'output.pdf');
    logFilePath = path.join(tempDir, 'output.log'); // Pandoc/LaTeX will often name the log based on output name

    // Write the received LaTeX source to a temporary file
    await fs.writeFile(inputTexPath, latexSource, 'utf8');

    // Construct the pandoc command
    // We use the temporary input and output paths inside the container
    const pandocArgs = [
      '-f', 'latex',
      '-t', 'pdf',
      '-V', 'papersize:letter', // Or 'a4' e.g., '-V', 'papersize:a4paper' also works
      '-V', 'geometry:left=0.7in,right=0.7in,top=0.5in,bottom=0.5in',
      inputTexPath,
      '-o', outputPdfPath,
      '--pdf-engine=pdflatex'
      // Add flags to disable shell escape for security if necessary
      // '--resource-path=' // Can restrict resource access if needed
      // Consider adding error handling flags if Pandoc supports them nicely
    ];

    fastify.log.info(`Executing pandoc with args: ${pandocArgs.join(' ')}`);
    fastify.log.debug(`Node.js process.env.PATH: ${process.env.PATH}`);
    
    await new Promise<void>((resolve, reject) => { // Changed Promise<true> to Promise<void> for clarity
      const pdflatexArgs = [
        '-interaction=nonstopmode',     // Prevents pdflatex from stopping on minor errors
        `-output-directory=${tempDir}`, // Crucial: Ensure output files go to tempDir
        inputTexPath
      ];

      // Adjust output paths if not using -jobname=output
      // pdflatex will name the output based on the input file name.
      // If inputTexPath is /tmp/.../input.tex, output will be /tmp/.../input.pdf
      const actualOutputPdfPath = path.join(tempDir, `${path.basename(inputTexPath, '.tex')}.pdf`);
      const actualLogFilePath = path.join(tempDir, `${path.basename(inputTexPath, '.tex')}.log`);

      fastify.log.info(`Expecting PDF at: ${actualOutputPdfPath}`);
      fastify.log.info(`Executing pdflatex with args: ${pdflatexArgs.join(' ')}`);

      const child = execFile('pdflatex', pdflatexArgs, { cwd: tempDir, timeout: 120000 },
        async (error, stdout, stderr) => { // Make this callback async for fs.access
          if (error) {
            // pdflatex often returns an error code even for warnings if output is produced.
            // Check if PDF was actually created.
            try {
              await fs.access(actualOutputPdfPath, fs.constants.F_OK);
              // PDF exists, treat as success with warnings
              fastify.log.warn(`pdflatex finished with an error code, but PDF was created. Error: ${error.message}`);
              if (stdout) fastify.log.warn(`pdflatex stdout: ${stdout}`);
              if (stderr) fastify.log.warn(`pdflatex stderr: ${stderr}`);
              
              try {
                const logContent = await fs.readFile(actualLogFilePath, 'utf8');
                fastify.log.warn(`pdflatex log file content (warnings):\n${logContent}`);
              } catch (logReadError) {
                fastify.log.warn(`Could not read pdflatex log file at ${actualLogFilePath} even on warning.`);
              }
              resolve(); // Resolve if PDF exists
              return;
            } catch (checkPdfError) {
              // PDF does not exist, so it's a real failure
              fastify.log.error(`pdflatex failed to create PDF. Error: ${error.message}`);
              if (stdout) fastify.log.error(`pdflatex stdout (error): ${stdout}`);
              if (stderr) fastify.log.error(`pdflatex stderr (error): ${stderr}`);
              try {
                const logContent = await fs.readFile(actualLogFilePath, 'utf8');
                reject(new Error(`pdflatex failed. Stderr: ${stderr}\nLog:\n${logContent}`));
              } catch (logReadError) {
                reject(new Error(`pdflatex failed. Stderr: ${stderr}. Could not read log file at ${actualLogFilePath}.`));
              }
              return;
            }
          } else {
            // Success
            if (stdout) fastify.log.info(`pdflatex Stdout: ${stdout}`);
            if (stderr) fastify.log.warn(`pdflatex Stderr (Warnings): ${stderr}`); // Log stderr even on success as it contains info
            resolve();
          }
        });

        if (child?.stdout && child?.stderr) {
          // Optional: Log real-time output if needed (can be noisy)
          child.stdout.on('data', (data) => fastify.log.debug(`Pandoc stdout: ${data.toString().trim()}`));
          child.stderr.on('data', (data) => fastify.log.debug(`Pandoc stderr: ${data.toString().trim()}`));
        }
    });

    // IMPORTANT: Ensure you read the correctly named PDF file
    // If inputTexPath was /tmp/.../input.tex, pdflatex creates /tmp/.../input.pdf
    const finalPdfPath = path.join(tempDir, `${path.basename(inputTexPath, '.tex')}.pdf`);
    const pdfBuffer = await fs.readFile(finalPdfPath);

    // // Execute the pandoc command
    // // We use promises wrap execFile for easier async/await
    // await new Promise((resolve, reject) => {
    //   const child = execFile('pandoc', pandocArgs, { cwd: tempDir, timeout: 60000 }, (error, stdout, stderr) => {
    //     if (error) {
    //       fastify.log.error(`Pandoc Error: ${error.message}`);
    //       fastify.log.error(`Pandoc Stderr: ${stderr}`);
    //       // Read log file for more details
    //       fs.readFile(logFilePath, 'utf8')
    //         .then(logContent => {
    //           reject(new Error(`Pandoc failed. Stderr: ${stderr}\nLog: ${logContent}`));
    //         })
    //         .catch(() => {
    //            // If log file doesn't exist or can't be read
    //           reject(new Error(`Pandoc failed. Stderr: ${stderr}. Could not read log file.`));
    //         });
    //     } else {
    //       fastify.log.info(`Pandoc Stdout: ${stdout}`);
    //       fastify.log.info(`Pandoc Stderr: ${stderr}`); // Warnings often here
    //       resolve(true);
    //     }
    //   });


    //   if (child?.stdout && child?.stderr) {
    //     // Optional: Log real-time output if needed (can be noisy)
    //     child.stdout.on('data', (data) => fastify.log.debug(`Pandoc stdout: ${data.toString().trim()}`));
    //     child.stderr.on('data', (data) => fastify.log.debug(`Pandoc stderr: ${data.toString().trim()}`));
    //   }
    // });


    // Read the generated PDF file
    // const pdfBuffer = await fs.readFile(outputPdfPath);

    // Set the appropriate headers for a PDF response
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="document_${randomUUID()}.pdf"`); // Suggest a unique filename

    // Send the PDF buffer as the response
    reply.send(pdfBuffer);

  } catch (error) {
    fastify.log.error('Error during PDF generation:', error);

    // Send an error response
    reply.status(500).send({
      error: 'Failed to generate PDF',
      details: error.message // Include pandoc/latex error details
    });

  } finally {
    // Clean up the temporary directory and its contents
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        fastify.log.info(`Cleaned up temporary directory: ${tempDir}`);
      } catch (cleanupError) {
        // Log the cleanup error, but don't fail the request because of it
        fastify.log.error('Error cleaning up temporary directory:', cleanupError);
      }
    }
  }
});

// Graceful shutdown logic
async function closeGracefully(signal: NodeJS.Signals) {
  fastify.log.info(`Received signal to terminate: ${signal}`);
  try {
    await fastify.close(); // This closes the server and waits for pending requests to finish (with a timeout)
    fastify.log.info('Fastify server closed successfully.');
    // Add any other cleanup tasks here
    process.exit(0); // Exit cleanly
  } catch (err) {
    fastify.log.error('Error during graceful shutdown', err);
    process.exit(1); // Exit with an error code
  }
}

process.on('SIGINT', () => closeGracefully('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => closeGracefully('SIGTERM')); // `docker stop`

fastify.listen({
  port: 80,
  host: "0.0.0.0"
}).catch(err => {
  fastify.log.error(err);
  process.exit(1);
})