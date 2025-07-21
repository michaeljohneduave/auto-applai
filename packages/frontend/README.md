# Auto-Apply Frontend

This is the frontend for the Auto-Apply application, a tool to help manage job applications.

## Getting Started

To run this application locally:

1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Set up environment variables:**
    Create a `.env` file in the `frontend` directory and add your Clerk publishable key:
    ```
    VITE_CLERK_PUBLISHABLE_KEY="your_clerk_publishable_key"
    ```
3.  **Run the development server:**
    ```bash
    npm run dev
    ```

## Architecture

The application is built with [React](https://react.dev/) and [Vite](https://vitejs.dev/). It uses a two-pane layout to display information.

### Core Libraries

*   **Authentication:** [Clerk](https://clerk.com/) is used for user authentication.
*   **Data Fetching:** [TanStack Query](https://tanstack.com/query) (React Query) is used for fetching, caching, and managing server state.
*   **Routing:** [TanStack Router](https://tanstack.com/router) is used for client-side routing.
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/) is used for styling.
*   **PDF Viewing:** [React-PDF](https://react-pdf.org/) is used to render PDF documents.
*   **Markdown Rendering:** [React-Markdown](https://github.com/remarkjs/react-markdown) is used to render Markdown content.

### Component Structure

*   `App.tsx`: The main application component, which sets up the layout and authentication flow.
*   `Header.tsx`: The application header, which includes the title and user button.
*   `BaseAssetTabs.tsx`: Displays tabs for the base assets (e.g., resume, personal info).
*   `ApplicationList.tsx`: Displays a table of job applications.
*   `AssetDisplay.tsx`: Displays the content of the selected asset (Markdown, PDF, or form).
*   `Spinner.tsx`: A simple loading spinner.

### State Management

*   **UI State:** A custom React context (`UIContext`) is used to manage the currently selected asset.
*   **Server State:** TanStack Query is used to manage all data fetched from the server.

## Testing

This project uses [Vitest](https://vitest.dev/) and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro) for testing. You can run the tests with:

```bash
npm run test
```

## TODO

*   Replace placeholder API functions in `src/api/index.ts` with real API calls.
*   Add more comprehensive tests.
*   Implement a more robust error handling strategy.
