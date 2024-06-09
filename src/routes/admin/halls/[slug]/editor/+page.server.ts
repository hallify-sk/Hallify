/** 
 * Load data for the page.
 * 
 * @type {import('./$types').PageServerLoad} 
 * @param {Object} context - The context object.
 * @param {Object} context.locals - Local data available for the server-side rendering.
 * @returns {Promise<Object>} Object containing tables and stage categories data.
 */
export async function load({ locals }) {
  return {
      /** List of tables. */
      tables: await locals.pb.collection("tables").getFullList(),
      /** List of stage categories. */
      stageCategories: await locals.pb.collection("stage_categories").getFullList()
  };
}

/**
* Actions available for the page.
*/
export const actions = {
  /**
   * Save stage action.
   * 
   * @param {Request} request - HTTP request object.
   * @param {Object} params - URL parameters.
   * @returns {Promise<Object>} Object containing success flag.
   */
  saveStage: async ({ request, locals, params }) => {
      const formData = await request.formData();
      const stage = formData.get("stage")?.toString();
      const image = formData.get("image") as Blob;
      const data = new FormData();

      if (stage) {
          data.append("data", stage);
      }
      if (image) {
          data.append("render", image, "stage.png");
      }

      try {
          await locals.pb.collection("halls").update(params.slug, data);
      } catch (e) {
          console.error(e);
      }

      return { success: true };
  }
};
