import { PUBLIC_DEV } from '$env/static/public';
import PocketBase from 'pocketbase';

import { promises as fs } from 'fs';

//const pocketbase = new PocketBase(POCKETBASE_URL);

//Give backend full access to work with DB (will investigate this later to find a more secure solution)

//Found better solution - use hooks with Pocketbase. Will do before first release.
//await pocketbase.admins.authWithPassword(PB_ADMIN_LOGIN, PB_ADMIN_PASSWORD);

//import schedule from 'node-schedule';
import { error, redirect } from '@sveltejs/kit';
/*
schedule.scheduleJob('*/ /*1 * * * *', async function () {
    //Prevents crash on sleep or network disconnect
    try{
        (await pocketbase.collection("temp_reservations").getFullList()).forEach((v) => {
            if(new Date(v.expires).getTime() < new Date().getTime()){
                //Delete the record, it expired.
                try{
                    pocketbase.collection("temp_reservations").delete(v.id);
                }catch(e){
                    console.error(e);
                }
            }
        })
    }catch(e){
        e;
    }
});
*/

let pbIsset = false;

let pbSecretURL: string = '';
let pbAPIURL: string = '';

//Hack to scope the variables
await fs.readFile('config/pocketbase.json').then((data => {
	const { POCKETBASE_URL, POCKETBASE_API_URL } = JSON.parse(data.toString());
	pbSecretURL = POCKETBASE_URL;
	pbAPIURL = POCKETBASE_API_URL;

	if(POCKETBASE_URL != ""){
		pbIsset = true;
	}
}));

export const handle = async ({ event, resolve }) => {
	if(!pbIsset){
		const data = await fs.readFile('config/pocketbase.json');
		const { POCKETBASE_URL, POCKETBASE_API_URL } = JSON.parse(data.toString());
		pbSecretURL = POCKETBASE_URL;
		pbAPIURL = POCKETBASE_API_URL;
	
		if(POCKETBASE_URL != ""){
			pbIsset = true;
		}
	}
	event.locals.authExpired = false;

	if(pbSecretURL && pbSecretURL != ""){
		event.locals.pb = new PocketBase(pbSecretURL);
	}

    event.locals.pbSecretURL = pbSecretURL;
    event.locals.pbApiURL = pbAPIURL;
	if (!pbIsset) {
		if (!event.route.id?.startsWith('/install')) {
			throw redirect(307, '/install');
		}
		const response = await resolve(event);

		return response;
	} else {
		if(event.route.id == "/install") throw error(404);
		event.locals.pb.authStore.loadFromCookie(event.request.headers.get('cookie') || '');
		if (event.locals.pb.authStore.isValid) {
			try {
				await event.locals.pb.collection('users').authRefresh();
			} catch (e) {
				if(event.route.id?.startsWith("/admin")){
					try{
						await event.locals.pb.admins.authRefresh();
					}catch(e){
						event.locals.pb.authStore.clear();
						event.locals.authExpired = true;
						e;
					}
				}else{
					event.locals.pb.authStore.clear();
					event.locals.authExpired = true;
					e;
				}
			}
			event.locals.user = (event.locals.pb as PocketBase).authStore.model;
		} else {
			event.locals.user = null;
		}

		const response = await resolve(event);

		//TODO: secure before deployment
		response.headers.set(
			'set-cookie',
			event.locals.pb.authStore.exportToCookie({ secure: PUBLIC_DEV != 'true' })
		);

		return response;
	}
};
