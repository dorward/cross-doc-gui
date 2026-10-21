import { describe, expect, it } from 'vitest';
import {
	categoryKey,
	entryKey,
	reconcileSelection,
	selectedSlugs,
	selectionKeys,
	treeNodes,
} from '../src/renderer/selection.ts';

const snapshot = {
	themes: ['A5', 'default'],
	project: '/project',
	categories: [{ id: 'person', heading: 'People' }],
	entries: [
		{ slug: 'person', title: 'Category name collision', category: 'person' },
		{ slug: 'bob', title: 'Bob', category: 'person' },
	],
};

describe('tree selection', () => {
	it('keeps category IDs distinct from slugs, and only submits checked entries', () => {
		expect(treeNodes(snapshot)[0].key).toBe(categoryKey('person'));
		expect(
			selectedSlugs(snapshot, {
				[categoryKey('person')]: { checked: true },
				[entryKey('person')]: { checked: true },
				[entryKey('bob')]: { partialChecked: true },
				'entry:unknown': { checked: true },
			}),
		).toEqual(['person']);
	});
	it('computes partial and complete category states from selected leaves', () => {
		expect(selectionKeys(snapshot, ['bob'])[categoryKey('person')]).toEqual({
			checked: false,
			partialChecked: true,
		});
		expect(selectionKeys(snapshot, ['person', 'bob'])[categoryKey('person')]).toEqual({
			checked: true,
			partialChecked: false,
		});
		expect(selectionKeys(snapshot, [])).toEqual({});
	});
	it('keeps an explicit subset on refresh and selects new entries when all were selected', () => {
		const next = {
			...snapshot,
			entries: [snapshot.entries[1], { slug: 'new', title: 'New', category: 'person' }],
		};
		expect(reconcileSelection(snapshot, next, ['person'])).toEqual([]);
		expect(reconcileSelection(snapshot, next, ['bob'])).toEqual(['bob']);
		expect(reconcileSelection(snapshot, next, ['person', 'bob'])).toEqual(['bob', 'new']);
	});
});
