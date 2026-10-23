import { error } from '@sveltejs/kit';
import { getArticle, articlesFor, type KbLocale } from '$lib/knowledgebase';
import { st } from '$lib/i18n-server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!getArticle(params.slug)) error(404, st(locals.locale).serverErrors.articleNotFound);

	// Both languages, so switching language on the page shows the other version
	// without a reload. "More in this category" suggestions with each.
	const pick = (l: KbLocale) => {
		const article = getArticle(params.slug, l)!;
		const related = articlesFor(l)
			.filter((a) => a.categoryId === article.categoryId && a.slug !== article.slug)
			.map(({ slug, title }) => ({ slug, title }));
		return { article, related };
	};

	return { sk: pick('sk'), en: pick('en') };
};
