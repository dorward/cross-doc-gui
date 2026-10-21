import type { TreeCheckboxSelectionKeys, TreeMultipleSelectionKeys } from 'primereact/tree';
import type { TreeNode } from 'primereact/treenode';
import type { ProjectSnapshot } from '../shared/api.js';

// Prefix both key namespaces so category IDs can never collide with entry slugs.
export const entryKey = (slug: string): string => `entry:${slug}`;
export const categoryKey = (id: string): string => `category:${id}`;

export function treeNodes(snapshot: ProjectSnapshot, disabled = false): TreeNode[] {
	return snapshot.categories.flatMap(({ id, heading }) => {
		const children = snapshot.entries
			.filter((entry) => entry.category === id)
			.map((entry) => ({
				key: entryKey(entry.slug),
				label: entry.title,
				leaf: true,
				disabled,
			}));
		return children.length ? [{ key: categoryKey(id), label: heading, children, disabled }] : [];
	});
}

export function selectionKeys(
	snapshot: ProjectSnapshot,
	selected: readonly string[],
): TreeCheckboxSelectionKeys {
	const slugs = new Set(selected);
	const keys: TreeCheckboxSelectionKeys = {};
	for (const node of treeNodes(snapshot)) {
		const children = node.children ?? [];
		let count = 0;
		for (const child of children) {
			if (typeof child.key !== 'string') continue;
			const slug = child.key.slice('entry:'.length);
			if (slugs.has(slug)) {
				keys[child.key] = { checked: true, partialChecked: false };
				count++;
			}
		}
		if (count && typeof node.key === 'string')
			keys[node.key] = {
				checked: count === children.length,
				partialChecked: count !== children.length,
			};
	}
	return keys;
}

export function selectedSlugs(
	snapshot: ProjectSnapshot,
	keys: TreeMultipleSelectionKeys | TreeCheckboxSelectionKeys,
): string[] {
	return snapshot.entries
		.filter(({ slug }) => {
			const selection = keys[entryKey(slug)];
			return typeof selection === 'object' && selection.checked;
		})
		.map(({ slug }) => slug);
}

export function reconcileSelection(
	previous: ProjectSnapshot,
	next: ProjectSnapshot,
	selected: readonly string[],
): string[] {
	const old = new Set(selected);
	const all = previous.entries.every(({ slug }) => old.has(slug));
	return next.entries.filter(({ slug }) => all || old.has(slug)).map(({ slug }) => slug);
}
