/**
 * Loads the initial data for the page.
 * @param data The data object containing stage, stageCategories, and tables
 * @returns An object containing stage, slug, stageCategories, and tables
 */
export const load = ({ params, data }) => {
	return {
		stage: data.stage,
		slug: params.slug,
		stageCategories: data.stageCategories,
		tables: data.tables
	};
};
