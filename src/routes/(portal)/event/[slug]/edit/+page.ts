/**
 * Loads the initial data for the page.
 * @param data The data object containing reservation, addons, categories and templates
 * @returns An object containing reservation, addons, slug, categories, and templates
 */
export const load = ({ params, data }) => {
    return {
        reservation: data.reservation,
        addons: data.addons,
        slug: params.slug,
        categories: data.categories,
        templates: data.templates
    }
}