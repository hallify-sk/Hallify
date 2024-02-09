export const serializeNonPOJOs = (obj: unknown) => {
    return JSON.parse(JSON.stringify(obj));
};