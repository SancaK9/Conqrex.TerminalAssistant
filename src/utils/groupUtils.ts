/**
 * Builds a hierarchical structure for command groups from flat paths
 */
export function buildGroupHierarchyForQuickPick(paths: string[]) {
    const root: any = { name: "", subgroups: {}, path: "" };

    paths.forEach(path => {
        const segments = path.split('/');
        let current = root;
        let currentPath = "";

        segments.forEach((segment) => {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;

            if (!current.subgroups[segment]) {
                current.subgroups[segment] = {
                    name: segment,
                    path: currentPath,
                    subgroups: {}
                };
            }

            current = current.subgroups[segment];
        });
    });

    return root;
}

/**
 * Formats group hierarchy for display in QuickPick UI
 */
export function formatGroupsForQuickPick(node: any, level = 0, result: any[] = []) {
    const indent = "  ".repeat(level);

    Object.values(node.subgroups).forEach((subgroup: any) => {
        result.push({
            label: `${indent}${level > 0 ? "↳ " : ""}${subgroup.name}`,
            description: `(${subgroup.path})`,
            path: subgroup.path
        });

        formatGroupsForQuickPick(subgroup, level + 1, result);
    });

    return result;
}
