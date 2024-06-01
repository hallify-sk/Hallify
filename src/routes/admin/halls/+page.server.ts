import { serializeNonPOJOs } from '$lib/lib';
import { fail } from '@sveltejs/kit';

export const actions: import('./$types').Actions = {
	getMoreHalls: async({locals, request}) => {
        const data = await request.formData()
        const page = data.get("page")?.toString();
        if(!page) return fail(400);
        if(isNaN(parseInt(page))) return fail(400);
        const halls = await locals.pb.collection("halls").getList(parseInt(page), 50, { sort: 'created', expand: 'user,addons,category' });
        if(!halls.items.length) return fail(404);
        return {
            halls: serializeNonPOJOs(halls)
        }
    },
    removeHalls: async({locals, request}) => {
        const formData = await request.formData();
        console.log(formData);
        const reason = formData.get("reason")?.toString();
        const checkboxes = formData.get("checkboxes")?.toString();

        const parsedCheckboxes = JSON.parse(checkboxes || "[]");
        if(!parsedCheckboxes.length || !reason) return fail(400);
        for(let i = 0; i < parsedCheckboxes.length; i++){
            await locals.pb.collection("halls").delete(parsedCheckboxes[i]);
        };
        return {success: true};
    },
    createHall: async({locals, request}) => {
        const hall = await locals.pb.collection("halls").create({name: "Nová sála", config: {}});
        return {hall};
    }
};

/** @type {import('./$types.d.ts').ServerLoad} */
export async function load({ locals }) {
	return {
		user: locals.user,
		halls: await locals.pb
		.collection('halls')
		.getList(0, 50, { sort: 'created' }),
		apiUrl: locals.pbApiURL
	};
}
