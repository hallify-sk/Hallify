import type { RecordModel } from 'pocketbase';

/** @type {import('./$types').PageServerLoad} */
export async function load({locals}) {
	/*if(!locals.pb.authStore.isAdmin){
		return {};
	}else{*/
		return {
			user: locals.user,
			reservations: await locals.pb.collection('reservations').getList(0,10, { sort: 'created', expand: "user,addons,category" }),
			apiUrl: locals.pbApiURL
		};
	//}
}
