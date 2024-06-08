/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  return {
    tables: await locals.pb.collection("tables").getFullList(),
    stageCategories: await locals.pb.collection("stage_categories").getFullList()
  };
}

export const actions = {
  saveStage: async ({ request, locals, params }) => {
    const formData = await request.formData();
    const name = formData.get("name")?.toString();
    const stage = formData.get("stage")?.toString();
    const image = formData.get("image") as Blob;
    const data = new FormData();

    if (stage) {
      data.append("data", stage);
    };
    if (image) {
      data.append("render", image, "stage.png")
    }

    try {
      locals.pb.collection("halls").update(params.slug, data);
    } catch (e) {
      console.error(e);
    }
    // Process the form data and perform actions
    return { success: true };
  },
};