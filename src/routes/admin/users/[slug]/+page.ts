/**
 * Loads user data based on the provided parameters and data.
 *
 * @param {Object} params - The parameters object containing slug information.
 * @param {Object} data - The data object containing user information.
 * @returns {Object} - An object containing user data and slug information.
 */
export const load = ({ params, data }) => {
    return {
        user: data.user,
        slug: params.slug,
    }
}
