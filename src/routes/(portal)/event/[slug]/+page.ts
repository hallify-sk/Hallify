/**
 * Loads the initial data for the page.
 * @param data The data object containing reservation and addons
 * @returns An object containing reservation, addons and slug
 */
export const load = ({ params, data }) => {
    return {
        reservation: data.reservation,
        addons: data.addons,
        slug: params.slug
    }
}