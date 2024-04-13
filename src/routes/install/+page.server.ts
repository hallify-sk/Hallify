import { fail, redirect } from '@sveltejs/kit';

import {readFile, writeFile} from "fs";

export const actions = {
    pocketbase: async ({request, fetch}) => {
        const data = await request.formData();
		const privateURL = data.get('private')?.toString();
		const apiURL = data.get('api')?.toString();

        try{
            if(!privateURL) return;
            // + /api/health to check whether we are in root of document
            const response = await fetch(privateURL + (privateURL.endsWith("/") ? "api/health" : "/api/health"));
            const json = await response.json();
            //Cause error if response was invalid
            if(!json.code || json.code != 200) throw false;
        }catch(e){
            return fail(400, { incorrect: true, message: 'Failed to connect to PocketBase.', type: "private" });
        }
        try{
            if(!apiURL) return;
            const response = await fetch(apiURL+"/health");
            const json = await response.json();
            //Cause error if response was invalid
            if(!json.code || json.code != 200) return fail(400, { incorrect: true, message: 'Connected to Pocketbase, but API path is incorrect.', type: "api"});
        }catch(e){
            return fail(400, { incorrect: true, message: 'Failed to connect to PocketBase.', type: "api" });
        };

        readFile('config/pocketbase.json', (e, data) => {
            const parsed = JSON.parse(data.toString());
            parsed.POCKETBASE_URL = privateURL.endsWith("/") ? privateURL.slice(0, -1) : privateURL;
            parsed.POCKETBASE_API_URL = apiURL.endsWith("/") ? apiURL.slice(0, -1) : apiURL;

            writeFile('config/pocketbase.json', JSON.stringify(parsed), {encoding: "utf-8"}, (e) => {
                console.log(e);
            });
        });

        throw redirect(303, `/admin?fromInstall=true`);
    },
};

/** @type {import('./$types').PageServerLoad} */
export async function load({locals}) {
	return {
        POCKETBASE_URL: locals.pbSecretURL,
        POCKETBASE_API_URL: locals.pbApiURL
    };
}
