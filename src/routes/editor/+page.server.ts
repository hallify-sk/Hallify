import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

/** @type {import('./$types').PageServerLoad} */
export async function load() {
	return {
		tables: await pb.collection("tables").getFullList()
	};
}

export const actions = {
    default: async ({ request }) => {
      const formData = await request.formData();
      const stage = formData.get("stage")?.toString();
      const tables = formData.get("tables")?.toString();
      const image = formData.get("image") as Blob;
      const data = new FormData();
      if(stage){
        data.append("stage", stage);
      };
      if(tables){
        data.append("tables", tables);
      };
      if(image){
        data.append("render", image, "stage.png")
      }
      pb.collection("stages").create(data);
      
      // Process the form data and perform actions
      return { success: true };
    },
  };