import * as command from "@pulumi/command";
import * as oci from "@pulumi/oci";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as path from "path";

// Configuration
const config = new pulumi.Config();
const projectName = config.require("projectName");
const environment = config.require("environment");
const instanceShape = config.require("instanceShape");
const ocpus = config.requireNumber("ocpus");
const memoryInGBs = config.requireNumber("memoryInGBs");
const bootVolumeSizeInGBs = config.require("bootVolumeSizeInGBs");
const repo = config.require("repo");

// App configuration secrets
const appConfig = new pulumi.Config("app");

// Deployment mode configuration
const deploymentMode = config.get("deploymentMode") || "git"; // "git" or "registry"

// SSH configuration (keys stored in Pulumi stack config under the "ssh" namespace)
const sshConfig = new pulumi.Config("ssh");
// Require base64-encoded PEM only
const privateKey = sshConfig
    .requireSecret("privateKeyPemB64")
    .apply((b64) => Buffer.from(b64, "base64").toString("utf-8"));
const publicKey = sshConfig.require("publicKey");

// Get configuration
// Project-specific configuration is read from the default namespace (Option A)
// Only true provider configs remain under the `oci` namespace (e.g., region)
const compartmentId = config.require("compartmentId");
const ociConfig = new pulumi.Config("oci");
const region = ociConfig.require("region");

// Stack name for resource naming
const stackName = pulumi.getStack();
const resourcePrefix = `${projectName}-${environment}-${stackName}`;

// Load externalized setup script for the instance
const setupScriptPath = path.join(__dirname, "scripts", "setup-instance.sh");
const setupScript = fs.readFileSync(setupScriptPath, "utf8");

// Load externalized deploy script and interpolate dynamic variables
const deployScriptTemplatePath = path.join(
    __dirname,
    "scripts",
    "deploy-application.sh",
);
const deployScriptTemplate = fs.readFileSync(deployScriptTemplatePath, "utf8");
const deployScript = pulumi.interpolate`
REPO="${repo}"
REGION="${region}"
RESOURCE_PREFIX="${resourcePrefix}"
DEPLOYMENT_MODE="${deploymentMode}"

${deployScriptTemplate}
`;

// 1. Create VCN (Virtual Cloud Network)
const vcn = new oci.core.Vcn(
	`${resourcePrefix}-vcn`,
	{
		compartmentId: compartmentId,
		cidrBlocks: ["10.0.0.0/16"],
		displayName: `${resourcePrefix}-vcn`,
		// dnsLabel: `${projectName}${environment}`,
	},
	{ protect: false },
);

// 2. Create Internet Gateway
const internetGateway = new oci.core.InternetGateway(
	`${resourcePrefix}-igw`,
	{
		compartmentId: compartmentId,
		vcnId: vcn.id,
		displayName: `${resourcePrefix}-internet-gateway`,
	},
	{ protect: false },
);

// 3. Create Route Table
const routeTable = new oci.core.RouteTable(
	`${resourcePrefix}-rt`,
	{
		compartmentId: compartmentId,
		vcnId: vcn.id,
		displayName: `${resourcePrefix}-route-table`,
		routeRules: [
			{
				destination: "0.0.0.0/0",
				destinationType: "CIDR_BLOCK",
				networkEntityId: internetGateway.id,
			},
		],
	},
	{ protect: false },
);

// 4. Create Public Subnet
// const publicSubnet = new oci.core.Subnet(
// 	`${resourcePrefix}-public-subnet`,
// 	{
// 		compartmentId: compartmentId,
// 		vcnId: vcn.id,
// 		cidrBlock: "10.0.2.0/24",
// 		displayName: `${resourcePrefix}-public-subnet`,
// 		routeTableId: routeTable.id,
// 		securityListIds: [], // Will be set after creating security list
// 	},
// 	{ protect: false },
// );

// 5. Create Security List for Public Subnet
const publicSecurityList = new oci.core.SecurityList(
	`${resourcePrefix}-public-sl`,
	{
		compartmentId: compartmentId,
		vcnId: vcn.id,
		displayName: `${resourcePrefix}-public-security-list`,
		egressSecurityRules: [
			{
				destination: "0.0.0.0/0",
				destinationType: "CIDR_BLOCK",
				protocol: "all",
				stateless: false,
			},
		],
		ingressSecurityRules: [
			// SSH access
			{
				protocol: "6", // TCP
				source: "0.0.0.0/0",
				sourceType: "CIDR_BLOCK",
				stateless: false,
				// tcpOptions: {
				// 	sourcePortRange: {
				// 		max: 22,
				// 		min: 22,
				// 	},
				// },
			},
			// HTTP access for API
			{
				protocol: "6", // TCP
				source: "0.0.0.0/0",
				sourceType: "CIDR_BLOCK",
				stateless: false,
				tcpOptions: {
					sourcePortRange: {
						max: 8080,
						min: 8080,
					},
				},
			},
			{
				protocol: "6", // TCP
				source: "0.0.0.0/0",
				sourceType: "CIDR_BLOCK",
				stateless: false,
				tcpOptions: {
					sourcePortRange: {
						max: 443,
						min: 443,
					},
				},
			},
		],
	},
	{ protect: false },
);

// Create subnet with security list
const publicSubnetWithSecurity = new oci.core.Subnet(
	`${resourcePrefix}-public-subnet-with-security`,
	{
		compartmentId: compartmentId,
		vcnId: vcn.id,
		cidrBlock: "10.0.1.0/24",
		displayName: `${resourcePrefix}-public-subnet`,
		routeTableId: routeTable.id,
		securityListIds: [publicSecurityList.id],
	},
	{ protect: false, dependsOn: [publicSecurityList] },
);

// 6. Get Object Storage namespace
const objectStorageNamespace = oci.objectstorage.getNamespace({
	compartmentId: compartmentId,
});

// 7. Create Object Storage Bucket for backups and assets
const backupBucket = new oci.objectstorage.Bucket(
	`${resourcePrefix}-backup-bucket`,
	{
		compartmentId: compartmentId,
		name: `${resourcePrefix}-backup-bucket`,
		namespace: objectStorageNamespace.then((ns) => ns.namespace),
		accessType: "NoPublicAccess",
		versioning: "Enabled",
		objectEventsEnabled: false,
	},
	{ protect: false },
);

const assetsBucket = new oci.objectstorage.Bucket(
	`${resourcePrefix}-assets-bucket`,
	{
		compartmentId: compartmentId,
		name: `${resourcePrefix}-assets-bucket`,
		namespace: objectStorageNamespace.then((ns) => ns.namespace),
		accessType: "NoPublicAccess",
		versioning: "Disabled",
		objectEventsEnabled: false,
	},
	{ protect: false },
);

// 7.5. Container Registry setup
const containerRepo = new oci.artifacts.ContainerRepository(
	`${resourcePrefix}-container-repo`,
	{
		compartmentId: compartmentId,
		displayName: `${resourcePrefix}/auto-apply`,
		isImmutable: false,
		isPublic: false,
	},
	{ protect: false },
);

// 8. Get available availability domains
const availabilityDomains = oci.identity.getAvailabilityDomains({
	compartmentId: compartmentId,
});

// 9. Get latest ARM-compatible Ubuntu image
const ubuntuImage = oci.core.getImages({
	compartmentId: compartmentId,
	operatingSystem: "Canonical Ubuntu",
	operatingSystemVersion: "22.04",
	state: "AVAILABLE",
	sortBy: "TIMECREATED",
	sortOrder: "DESC",
});

// 10. SSH keys are provided via Pulumi config (ssh:publicKey, ssh:privateKeyPem)

// 11. Create Compute Instance
const instance = new oci.core.Instance(
	`${resourcePrefix}-instance`,
	{
		availabilityDomain: availabilityDomains.then(
			(ads) => ads.availabilityDomains[0].name,
		),
		compartmentId: compartmentId,
		displayName: `${resourcePrefix}-instance`,
		shape: instanceShape,
		shapeConfig: {
			ocpus: ocpus,
			memoryInGbs: memoryInGBs,
		},
		sourceDetails: {
			sourceType: "image",
			sourceId: ubuntuImage.then((img) => img.images[0].id),
		},
		createVnicDetails: {
			subnetId: publicSubnetWithSecurity.id,
			assignPublicIp: "true",
		},
		metadata: {
			ssh_authorized_keys: publicKey,
		},
	},
	{ protect: false },
);

// 12. Create and attach block volume for persistent data
const blockVolume = new oci.core.Volume(
	`${resourcePrefix}-data-volume`,
	{
		availabilityDomain: availabilityDomains.then(
			(ads) => ads.availabilityDomains[0].name,
		),
		compartmentId: compartmentId,
		displayName: `${resourcePrefix}-data-volume`,
		sizeInGbs: "50", // 50GB for data storage
	},
	{ protect: false },
);

const volumeAttachment = new oci.core.VolumeAttachment(
	`${resourcePrefix}-volume-attachment`,
	{
		attachmentType: "paravirtualized",
		instanceId: instance.id,
		volumeId: blockVolume.id,
		displayName: `${resourcePrefix}-volume-attachment`,
	},
	{ protect: false },
);

// Removed debug logging of private key material

// 13. Setup Docker and application on the instance
const setupInstance = new command.remote.Command(
	`${resourcePrefix}-setup-instance`,
	{
		connection: {
			host: instance.publicIp,
			user: "ubuntu",
			privateKey: privateKey,
		},
		create: setupScript,
	},
	{ dependsOn: [instance], protect: false, customTimeouts: { create: "10m" } },
);

// 14. Write environment variables
const writeEnv = new command.remote.Command(
	`${resourcePrefix}-write-env`,
	{
		connection: {
			host: instance.publicIp,
			user: "ubuntu",
			privateKey: privateKey,
		},
		create: pulumi.interpolate`
        set -euo pipefail
        sudo tee /opt/auto-apply/.env >/dev/null <<'EOF'
NODE_ENV=production
PORT=8080
API_PORT=${appConfig.get("API_PORT") || "8080"}
GEMINI_API_KEY=${appConfig.requireSecret("GEMINI_API_KEY")}
CLERK_PUBLISHABLE_KEY=${appConfig.require("CLERK_PUBLISHABLE_KEY")}
CLERK_SECRET_KEY=${appConfig.requireSecret("CLERK_SECRET_KEY")}
PUPPETEER_SERVICE_URL=${appConfig.get("PUPPETEER_SERVICE_URL") || "http://puppeteer-mcp:80"}
PDF_SERVICE_URL=${appConfig.get("PDF_SERVICE_URL") || "http://pandoc-latex:80"}
EOF
        sudo chown ubuntu:ubuntu /opt/auto-apply/.env
        chmod 600 /opt/auto-apply/.env
        echo "Environment file created"
    `,
	},
	{ dependsOn: [setupInstance], protect: false },
);

// 15. Deploy application
const deployApplication = new command.remote.Command(
	`${resourcePrefix}-deploy-app`,
	{
		connection: {
			host: instance.publicIp,
			user: "ubuntu",
			privateKey: privateKey,
		},
		triggers: [instance.id],
		create: deployScript,
	},
	{
		dependsOn: [writeEnv],
		protect: false,
		customTimeouts: { create: "15m" },
	},
);

// Outputs
export const instancePublicIp = instance.publicIp;
export const instanceId = instance.id;
export const vcnId = vcn.id;
export const subnetId = publicSubnetWithSecurity.id;
export const backupBucketName = backupBucket.name;
export const assetsBucketName = assetsBucket.name;
export const containerRegistryUrl = pulumi.interpolate`${region}.ocir.io`;
export const containerImageName = pulumi.interpolate`${region}.ocir.io/${objectStorageNamespace.then((ns) => ns.namespace)}/${resourcePrefix}/auto-apply`;
// SSH key material comes from Pulumi config now; do not expose file paths

// Connection information
export const connectionInfo = {
	host: instance.publicIp,
	user: "ubuntu",
	applicationUrl: pulumi.interpolate`http://${instance.publicIp}:8080`,
	healthCheckUrl: pulumi.interpolate`http://${instance.publicIp}:8080/health`,
};
