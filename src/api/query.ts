import {
  FieldNode,
  FragmentSpreadNode,
  GraphQLNamedType,
  GraphQLResolveInfo,
  Kind,
  NamedTypeNode,
  NonNullTypeNode,
  ObjectTypeDefinitionNode,
  SelectionNode,
  TypeNode,
  FieldDefinitionNode,
  StringValueNode,
} from "graphql";
import { OnlyDirectiveArgs } from "./generated/graphql";

interface CurrentContext {
  rootName: string;
  fragments: GraphQLResolveInfo["fragments"];
  schema: GraphQLResolveInfo["schema"];
}

interface RenderableObject {
  selectedFields: readonly SelectionNode[];
  typeNode: TypeNode;
}

const genFilter = ({ field, op = "===", value = "true" }: OnlyDirectiveArgs) => {
  return `.filter((e) => e.${field}() ${op} ${value})`;
};
const convertFragSpread = (ctx: CurrentContext, f: FragmentSpreadNode): string => {
  const name = f.name.value;
  const fs = ctx.fragments[name];
  const astNode = ctx.schema.getType(fs.typeCondition.name.value)?.astNode;

  return convertFields(ctx, fs.selectionSet.selections, astNode);
};

const convertField = (ctx: CurrentContext, f: FieldNode, fieldDefinition: FieldDefinitionNode): string => {
  // TODO: handle in connection renderer
  if (f.name.value === "pageInfo") {
    return "";
  }
  if (f.name.value === "edges") {
    return "";
  }
  const typeNode = fieldDefinition.type;
  const name = f.name.value;

  if (f.selectionSet) {
    const args: string[] = [];
    f.arguments?.forEach((a) => {
      if (a.value.kind !== Kind.VARIABLE) {
        throw "Non variable argument found";
      }
      args.push(a.value.name.value);
    });

    const noCall = fieldDefinition.directives?.some((d) => d.name.value === "noCall");
    const onlyDirectives = (f.directives ?? [])
      .filter((t) => t.name.value == "only")
      .map(
        (t) =>
          Object.fromEntries(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            t.arguments!.map((a) => [a.name.value, (a.value as StringValueNode).value])
          ) as OnlyDirectiveArgs
      );
    const arrayTap = onlyDirectives.map(genFilter).join("");
    const suffix = noCall ? "" : `(${args.join(",")})`;
    const child = `${ctx.rootName}.${name}${suffix}`;
    return `${name}: ${convertObject(
      { ...ctx, rootName: child },
      { selectedFields: f.selectionSet.selections, typeNode },
      {
        arrayTap,
      }
    )},`;
  }
  return `${name}: ${ctx.rootName}.${name}(),`;
};

const unwrapType = (typeNode: TypeNode): NamedTypeNode => {
  if (typeNode.kind === Kind.NAMED_TYPE) {
    return typeNode;
  }
  return unwrapType(typeNode.type);
};

const mustFindTypeDefinition = (ctx: CurrentContext, typeNode: TypeNode): ObjectTypeDefinitionNode => {
  const typeName = unwrapType(typeNode).name.value;
  const typeDef = ctx.schema.getType(typeName)?.astNode;
  if (!typeDef) {
    throw new Error("type def undefined");
  }
  if (typeDef.kind !== Kind.OBJECT_TYPE_DEFINITION) {
    throw new Error("unsupported type definition kind");
  }
  return typeDef;
};

const dig = (ctx: CurrentContext, object: RenderableObject, ...fieldNames: string[]): RenderableObject | null => {
  if (fieldNames.length === 0) {
    return object;
  }
  const fieldName = fieldNames[0];
  const typeDef = mustFindTypeDefinition(ctx, object.typeNode);
  const typeNode = typeDef.fields?.find((f) => f.name.value === fieldName)?.type;
  if (!typeNode) {
    throw new Error("edges definition not found");
  }

  const selectedFields = object.selectedFields.filter(isField).find((f) => f.name.value === fieldName)
    ?.selectionSet?.selections;

  if (!selectedFields) {
    return null;
  }

  return dig(ctx, { selectedFields, typeNode }, ...fieldNames.slice(1));
};
const mustFindFieldDefinition = (typeNode: ObjectTypeDefinitionNode, field: FieldNode): FieldDefinitionNode => {
  const name = field.name.value;
  const found = typeNode.fields?.find((def) => def.name.value === name);
  if (!found) {
    throw new Error(`Field definition for "${name}" not found`);
  }
  return found;
};

const convertObject = (
  ctx: CurrentContext,
  object: RenderableObject,
  opts: Partial<{ arrayTap: string }> = {}
): string => {
  if (object.typeNode.kind === Kind.NON_NULL_TYPE) {
    return convertNonNullFields(ctx, object.selectedFields, object.typeNode.type, opts);
  }

  return `${ctx.rootName} ? ${convertNonNullFields(ctx, object.selectedFields, object.typeNode, opts)}: undefined`;
};

const isField = (n: SelectionNode): n is FieldNode => {
  return n.kind === Kind.FIELD;
};

const convertNonNullFields = (
  ctx: CurrentContext,
  fs: readonly SelectionNode[],
  typeNode: NonNullTypeNode["type"],
  opts: Partial<{ arrayTap: string }> = {}
) => {
  const typeDef = mustFindTypeDefinition(ctx, typeNode);
  if (typeNode.kind === Kind.LIST_TYPE) {
    return `${ctx.rootName}${opts.arrayTap ?? ""}.map((elm) => {
      return { ${convertFields({ ...ctx, rootName: "elm" }, fs, typeDef)} };
     })`;
  }

  const isConnection = typeDef.interfaces?.some((i) => i.name.value === "Connection");

  if (isConnection) {
    // TODO: consider cursor
    // TODO: convert elm

    const renderNodeField = () => {
      const object = dig(ctx, { selectedFields: fs, typeNode }, "edges", "node");
      if (object === null) {
        return "";
      }
      return `node: ${convertObject({ ...ctx, rootName: "elm" }, object)},`;
    };

    return `
    (() => {
      const nodes = ${ctx.rootName}();
      return {
        pageInfo: {
          hasPreviousPage: false,
          hasNextPage: false,
          startCursor: "",
          endCursor: "",
        },
        edges: nodes.map((elm) => {
          return {
            cursor: elm.id(),
            ${renderNodeField()}
          }
        }),
        ${convertFields(ctx, fs, typeDef)}
      }
    })()
    `;
  }

  return `{ ${convertFields(ctx, fs, typeDef)} }`;
};

const convertFields = (
  ctx: CurrentContext,
  selectedFields: readonly SelectionNode[],
  parentTypeDefinition: GraphQLNamedType["astNode"]
) => {
  if (!parentTypeDefinition) {
    throw new Error("type def undefined");
  }
  if (parentTypeDefinition.kind !== Kind.OBJECT_TYPE_DEFINITION) {
    throw new Error("unsupported type definition kind");
  }

  return selectedFields
    .map((f) => {
      if (f.kind === Kind.INLINE_FRAGMENT) {
        throw new Error(`unsupported node type: ${f.kind}"`);
      }
      if (f.kind === Kind.FRAGMENT_SPREAD) {
        return convertFragSpread(ctx, f);
      }
      return convertField(ctx, f, mustFindFieldDefinition(parentTypeDefinition, f));
    })
    .join("");
};

export const genQuery = (
  rootName: string,
  info: Pick<GraphQLResolveInfo, "operation" | "fragments" | "variableValues" | "schema">
) => {
  const vars = Object.entries(info.variableValues)
    .map(([k, v]) => `const ${k} = ${JSON.stringify(v)};`)
    .join("\n");

  const field = info.operation.selectionSet.selections[0];
  if (field.kind !== Kind.FIELD || field.selectionSet === undefined) {
    throw new Error(`unsupported node type or undefined selectionSet`);
  }

  const fdef = info.schema.getQueryType()?.getFields()[field.name.value].astNode?.type;
  if (fdef === undefined) {
    throw new Error(`unsupported node type or undefined selectionSet`);
  }

  const fs = field.selectionSet.selections;
  return `${vars}(${convertObject({ ...info, rootName }, { selectedFields: fs, typeNode: fdef })})`;
};
