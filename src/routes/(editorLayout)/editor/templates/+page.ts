/**
 * Load function for fetching data needed for the page.
 * 
 * @param {object} data - The data object containing reservation, addons, categories, templates, and apiUrl.
 * @returns {object} An object containing reservation, addons, slug, categories, templates, and apiUrl.
 */
export const load = ({ params, data }) => {
    return {
        reservation: data.reservation,
        addons: data.addons,
        slug: params.slug,
        categories: data.categories,
        templates: data.templates,
        apiUrl: data.apiUrl
    };
};
