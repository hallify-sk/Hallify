/**
 * Loads the initial data for the page.
 * @param data The data object containing user, reservation, reservation, categories and templates
 * @returns An object containing user, reservation, addons, slug, categories and templates
 */
export const load = ({ params, data }) => {
    return {
        user: data.user,
        reservation: data.reservation,
        addons: data.addons,
        slug: params.slug,
        categories: data.categories,
        templates: data.templates
    }
}