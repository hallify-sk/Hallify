import { error, fail } from '@sveltejs/kit';

export const actions: import('./$types').Actions = {
	saveChanges: async ({ locals, request, params }) => {
		const hallId = params.slug;
		const data = await request.formData();
		const hall = await locals.pb
			.collection('halls')
			.getFullList({ filter: `id="${hallId}"` });
		if (!hall.length) {
			throw error(404, { message: 'Not found' });
		}
		let newData;
		var object: { [key: string]: string } = {};
		data.forEach(function (value, key) {
			if(key == "hallName" || key == "disabled") return;
			object[key] = value.toString();
		});
		console.log(object);
		try {
			var json = JSON.stringify(object);
				//If toggleModule is updated, only update toggleModule
				console.log(data.get("toggleModule"));
				if (!data.get('toggleModule')) {
					hall[0].config.toggleModule = data.get('toggleModule');
					json = JSON.stringify(hall[0].config);
				}
				console.log(json);
				
				newData = await locals.pb
					.collection('halls')
					.update(hallId, {
						enabled: data.get('enabled') === 'on' ? true : false,
						name: data.get("hallName")?.toString() || hall[0].name,
						config: json,
					});
		} catch (e) {
			throw fail(500);
		}
		return {
			config: newData
		};
	}
};

/** @type {import('./$types.d.ts').ServerLoad} */
export async function load({ locals, params }) {
	let hall;
	try{
		hall = await locals.pb.collection("halls").getOne(params.slug);
	}catch(e){
		throw error(404, {message: "Not found"});
	}

	return {
		user: locals.user,
		hall: hall,
		apiUrl: locals.pbApiURL
	};
}
