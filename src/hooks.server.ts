import { PUBLIC_DEV } from '$env/static/public';
import { LOCAL_POCKETBASE_URL, PB_ADMIN_LOGIN, PB_ADMIN_PASSWORD } from '$env/static/private';
import PocketBase from 'pocketbase';

const pocketbase = new PocketBase(LOCAL_POCKETBASE_URL);

//Give backend full access to work with DB (will investigate this later to find a more secure solution)
await pocketbase.admins.authWithPassword(PB_ADMIN_LOGIN, PB_ADMIN_PASSWORD);

import schedule from "node-schedule"
schedule.scheduleJob('*/1 * * * *', async function () {
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
});

export const handle = async ({event, resolve}) => {
    event.locals.authExpired = false;
    event.locals.pb = new PocketBase(LOCAL_POCKETBASE_URL);

    event.locals.pb.authStore.loadFromCookie(
        event.request.headers.get('cookie') || ''
    );
    if(event.locals.pb.authStore.isValid) {
        try{
            await event.locals.pb.collection("users").authRefresh();
        }catch(e){
            event.locals.pb.authStore.clear();
            event.locals.authExpired = true;
            e;
        };
        event.locals.user = (event.locals.pb as PocketBase).authStore.model;
    }else{
        event.locals.user = null;
    };

    const response = await resolve(event);

    //TODO: secure before deployment
    response.headers.set('set-cookie', event.locals.pb.authStore.exportToCookie(
        {secure: PUBLIC_DEV != "true"}
    ));

    return response;
}