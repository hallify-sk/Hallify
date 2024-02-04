import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

/** @type {import('./$types').PageServerLoad} */
export async function load() {
	return {
		tables: await pb.collection("tables").getFullList(),
		stageCategories: await pb.collection("stage_categories").getFullList()
	};
}

export const actions = {
    default: async ({ request }) => {
      const formData = await request.formData();
      const name = formData.get("name")?.toString();
      const stage = formData.get("stage")?.toString();
      const tables = formData.get("tables")?.toString();
      const image = formData.get("image") as Blob;
      const categories: string[] = [];
      formData.forEach((v, k) => {
        if(!["name", "stage", "tables", "image"].includes(k)) categories.push(k);
      });
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
      if(name){
        data.append("name", name);
      }
      if(categories.length){
        console.log(JSON.stringify(categories);
        data.append("categories", categories);
      }
      pb.collection("stages").create(data);
      
      // Process the form data and perform actions
      return { success: true };
    },
  };