/** @type {import('./$types.d.ts').ServerLoad} */
export async function load({locals, url}) {

	let reservations;

	if(url.searchParams.get("query")){
		reservations = await locals.pb.collection('reservations').getFullList({ sort: 'created', expand: "user,addons,category"});
	}else{
		reservations = await locals.pb.collection('reservations').getList(0,50, { sort: 'created', expand: "user,addons,category" });
	};

	return {
		user: locals.user,
		reservations,
		apiUrl: locals.pbApiURL
	};
}