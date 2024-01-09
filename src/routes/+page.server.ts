import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

export const actions = {
    default: async ({ request }) => {
      const formData = await request.formData();
      const stage = formData.get("stage")?.toString();
      const tables = formData.get("tables")?.toString();
      if(stage && tables){
        pb.collection("stages").create({stage: JSON.parse(stage), tables: JSON.parse(tables)});
      }
      // Process the form data and perform actions
      return { success: true };
    },
  };