import { fail, redirect } from '@sveltejs/kit';
import { readFile, writeFile } from "fs";

export const actions = {
    pocketbase: async ({ request, fetch }) => {
        // Extract private and API URLs from the request data
        const data = await request.formData();
        const privateURL = data.get('private')?.toString();
        const apiURL = data.get('api')?.toString();

        try {
            // Check connectivity to the private URL
            if (!privateURL) return;
            const response = await fetch(privateURL + (privateURL.endsWith("/") ? "api/health" : "/api/health"));
            const json = await response.json();
            if (!json.code || json.code != 200) throw false; // Throw error if response is invalid
        } catch (e) {
            // Handle connection failure to PocketBase private URL
            return fail(400, { incorrect: true, message: 'Failed to connect to PocketBase.', type: "private" });
        }

        try {
            // Check connectivity to the API URL
            if (!apiURL) return;
            const response = await fetch(apiURL + "/health");
            const json = await response.json();
            if (!json.code || json.code != 200) return fail(400, { incorrect: true, message: 'Connected to Pocketbase, but API path is incorrect.', type: "api" });
        } catch (e) {
            // Handle connection failure to PocketBase API URL
            return fail(400, { incorrect: true, message: 'Failed to connect to PocketBase.', type: "api" });
        }

        // Update PocketBase configuration file with provided URLs
        readFile('config/pocketbase.json', (e, data) => {
            const parsed = JSON.parse(data.toString());
            parsed.POCKETBASE_URL = privateURL.endsWith("/") ? privateURL.slice(0, -1) : privateURL;
            parsed.POCKETBASE_API_URL = apiURL.endsWith("/") ? apiURL.slice(0, -1) : apiURL;

            // Write updated configuration to file
            writeFile('config/pocketbase.json', JSON.stringify(parsed), { encoding: "utf-8" }, (e) => {
                console.log(e);
            });
        });

        // Redirect to admin page after configuration is completed
        throw redirect(303, `/admin?fromInstall=true`);
    },
};

/**
 * Load function for the page.
 * @param {object} options - Options for server load.
 * @param {object} locals - Local data specific to the request.
 * @returns {object} - Object containing PocketBase URLs.
 */
export async function load({ locals }) {
    // Return PocketBase URLs from local data
    return {
        POCKETBASE_URL: locals.pbSecretURL,
        POCKETBASE_API_URL: locals.pbApiURL
    };
}
