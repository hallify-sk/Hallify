/**
 * Loads the initial data for the page.
 * @param params The parameters passed to the page
 * @param data The data object containing stage, stageCategories, and tables
 * @returns An object containing stage, slug, stageCategories, and tables
 */
export const load = ({ params, data }: { params: any; data: any }) => {
    return {
        stage: data.stage,
        slug: params.slug,
        stageCategories: data.stageCategories,
        tables: data.tables
    };
};
