// Inventory routes from Angular's route declarations without executing application code.
// Includes redirects and inherited guards; does not claim runtime or visual coverage.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const entries = [];
const layouts = new Set();
function routes(file, prefix = '', inheritedGuards = []) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const prop = (node, name) => node.properties.find(p => p.name?.getText(source) === name)?.initializer;
  const imports = new Map();
  for (const node of source.statements) {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const binding of node.importClause.namedBindings.elements) imports.set(binding.name.text, node.moduleSpecifier.text);
    }
  }
  const componentFile = node => {
    const loader = prop(node, 'loadComponent');
    const imported = loader?.getText(source).match(/import\(['"]([^'"]+)/)?.[1];
    const direct = prop(node, 'component');
    const target = imported ?? (direct && imports.get(direct.getText(source)));
    return target ? path.relative(root, path.resolve(path.dirname(file), target + '.ts')) : null;
  };
  function visit(array, parent, guards) {
    for (const node of array.elements) {
      if (!ts.isObjectLiteralExpression(node)) continue;
      const routePath = prop(node, 'path');
      if (!routePath || !ts.isStringLiteral(routePath)) continue;
      const url = ('/' + [parent, routePath.text].filter(Boolean).join('/')).replace(/\/+/g, '/');
      const access = [...guards, ...['canMatch', 'canActivate'].flatMap(key => {
        const value = prop(node, key);
        return value && ts.isArrayLiteralExpression(value) ? value.elements.map(n => n.getText(source)) : [];
      })];
      const component = componentFile(node);
      const children = prop(node, 'children');
      const lazy = prop(node, 'loadChildren');
      const redirect = prop(node, 'redirectTo');
      if (children && ts.isArrayLiteralExpression(children)) {
        if (component) layouts.add(component);
        if (!children.elements.length) entries.push({ path: url, component, guards: access, kind: 'guard destination' });
        visit(children, url, access);
      } else if (lazy) {
        const target = lazy.getText(source).match(/import\(['"]([^'"]+)/)?.[1];
        if (!target) throw new Error('Unresolved route loader: ' + url);
        routes(path.resolve(path.dirname(file), target + '.ts'), url, access);
      } else {
        entries.push({ path: url, component, guards: access, kind: redirect ? 'redirect' : 'screen', ...(redirect ? { redirect: redirect.getText(source) } : {}) });
      }
    }
  }
  for (const node of source.statements) {
    if (!ts.isVariableStatement(node)) continue;
    for (const declaration of node.declarationList.declarations) {
      if (declaration.initializer && ts.isArrayLiteralExpression(declaration.initializer) && /routes$/i.test(declaration.name.getText(source))) visit(declaration.initializer, prefix, inheritedGuards);
    }
  }
}
routes(path.join(root, 'src/app/app.routes.ts'));
for (const entry of entries) if (entry.component && !fs.existsSync(path.join(root, entry.component))) throw new Error('Missing screen: ' + entry.component);
console.log(JSON.stringify({ entries, layouts: [...layouts].sort() }, null, 2));
