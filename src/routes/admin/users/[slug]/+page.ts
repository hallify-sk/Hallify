export const load = ({ params, data }) => {
    return {
        user: data.user,
        slug: params.slug,
    }
}