import PocketBase from "pocketbase";

/** @type {import('./$types').PageServerLoad} */
/**
 * Loads data for the page server.
 * @returns An object containing stage, stageCategories, and tables data
 */
export async function load({ locals, params }: { locals: any; params: any }) {
	return {
		stage: await (locals.pb as PocketBase).collection('stage_templates').getOne(params.slug, { expand: 'categories' }),
		stageCategories: await locals.pb.collection('stage_categories').getFullList(),
		tables: await locals.pb.collection("tables").getFullList(),
	};
}

/**
 * Actions for saving stage data.
 * @param request HTTP
 * @returns An object indicating success
 */
export const actions = {
	saveStage: async ({ request, locals }: { request: any; locals: any }) => {
		const formData = await request.formData();
		const name = formData.get('name')?.toString();
		const stage = formData.get('stage')?.toString();
		const tables = formData.get('tables')?.toString();
		const chairCount = formData.get('chairCount')?.toString();
		const image = formData.get('image') as Blob;
		const categories: string[] = [];
		formData.forEach((v, k) => {
			if (!['name', 'stage', 'tables', 'image', 'chairCount'].includes(k)) categories.push(k);
		});
		console.log(JSON.stringify(categories));
		const data = new FormData();
		if (stage) {
			data.append('stage', stage);
		}
		if (tables) {
			data.append('tables', tables);
		}
		if (image) {
			data.append('image', image, 'stage.png');
		}
		if (name) {
			data.append('name', name);
		}
		if (chairCount) {
			data.append('chairCount', chairCount);
		}
		if (categories.length) {
			for (const category of categories) {
				//Append the categories to the form data
				data.append('categories', category);
			}
		}
		console.log(data);
		try {
			locals.pb.collection('stage_templates').create(data);
		} catch (e) {
			console.error(e);
		}
		// Process the form data and perform actions
		return { success: true };
	}
};
