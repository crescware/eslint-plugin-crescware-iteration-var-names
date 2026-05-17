type Position = { line: number; column: number };
type Loc = { start: Position; end: Position };

type Identifier = { type: "Identifier"; name: string; loc?: Loc };

type Param = { type: string; loc?: Loc; name?: string };

type Pattern = {
  type: string;
  name?: string;
  elements?: (Pattern | null)[];
  properties?: ObjectPatternProperty[];
  argument?: Pattern;
  left?: Pattern;
  value?: Pattern;
};

type ObjectPatternProperty =
  | { type: "Property"; value: Pattern; key?: unknown }
  | { type: "RestElement"; argument: Pattern };

type VariableDeclarator = { type: "VariableDeclarator"; id: Pattern };
type VariableDeclaration = {
  type: "VariableDeclaration";
  declarations: VariableDeclarator[];
};

type FunctionLike = {
  type: "ArrowFunctionExpression" | "FunctionExpression";
  async?: boolean;
  params: Param[];
};

type CallExpression = {
  type: "CallExpression";
  callee: {
    type: string;
    computed?: boolean;
    property?: { type: string; name?: string };
  };
  arguments: { type: string; async?: boolean; params?: Param[] }[];
};

type ForStatement = {
  type: "ForStatement";
  init: VariableDeclaration | null | { type: string };
};
type ForOfOrInStatement = {
  type: "ForOfStatement" | "ForInStatement";
  left: VariableDeclaration | Pattern;
};

type ReportDescriptor = { message: string; node: unknown };
type RuleContext = { report: (descriptor: ReportDescriptor) => void };

type Visitor = Record<string, (node: never) => void>;

type Rule = {
  meta?: Record<string, unknown>;
  create: (context: RuleContext) => Visitor;
};

const TARGET_METHODS = new Set([
  "map",
  "filter",
  "forEach",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "some",
  "every",
  "flatMap",
  "reduce",
  "reduceRight",
  "sort",
]);

type MethodKind = "reduce-sync" | "reduce-async" | "sort" | "iterator";

const FOR_ALLOWED_INNER = new Set(["k", "v", "i"]);

type ArrayCallbackFrame = {
  kind: "array-callback";
  methodKind: MethodKind;
  methodName: string;
  hasNested: boolean;
};
type ForFrame = {
  kind: "for" | "for-of" | "for-in";
  hasNested: boolean;
};
type IterationFrame = ArrayCallbackFrame | ForFrame;

const expectedNamesFor = (kind: MethodKind): readonly string[] => {
  switch (kind) {
    case "reduce-sync":
      return ["acc", "v", "i", "arr"];
    case "reduce-async":
      return ["prev", "v", "i", "arr"];
    case "sort":
      return ["a", "b"];
    case "iterator":
      return ["v", "i", "arr"];
  }
};

const methodKindOf = (
  methodName: string,
  isAsync: boolean,
): MethodKind | null => {
  if (methodName === "reduce" || methodName === "reduceRight") {
    return isAsync ? "reduce-async" : "reduce-sync";
  }
  if (methodName === "sort") {
    return "sort";
  }
  if (TARGET_METHODS.has(methodName)) {
    return "iterator";
  }
  return null;
};

const getTargetMethodName = (call: CallExpression): string | null => {
  const callee = call.callee;
  if (callee.type !== "MemberExpression") {
    return null;
  }
  if (callee.computed === true) {
    return null;
  }
  const property = callee.property;
  if (property === undefined || property.type !== "Identifier") {
    return null;
  }
  const name = property.name;
  if (name === undefined || !TARGET_METHODS.has(name)) {
    return null;
  }
  return name;
};

const getCallbackFunction = (call: CallExpression): FunctionLike | null => {
  const first = call.arguments[0];
  if (first === undefined) {
    return null;
  }
  if (
    first.type !== "ArrowFunctionExpression" &&
    first.type !== "FunctionExpression"
  ) {
    return null;
  }
  return first as unknown as FunctionLike;
};

const isIdentifier = (node: Param | undefined): node is Identifier => {
  return (
    node !== undefined &&
    node.type === "Identifier" &&
    typeof node.name === "string"
  );
};

const collectPatternIdentifiers = (node: Pattern | null): Identifier[] => {
  if (node === null) {
    return [];
  }
  switch (node.type) {
    case "Identifier":
      if (typeof node.name !== "string") {
        return [];
      }
      return [node as Identifier];
    case "ArrayPattern":
      return (node.elements ?? []).flatMap((el) =>
        collectPatternIdentifiers(el),
      );
    case "ObjectPattern":
      return (node.properties ?? []).flatMap((v) => {
        if (v.type === "Property") {
          return collectPatternIdentifiers(v.value);
        }
        if (v.type === "RestElement") {
          return collectPatternIdentifiers(v.argument);
        }
        return [];
      });
    case "RestElement":
      return collectPatternIdentifiers(node.argument ?? null);
    case "AssignmentPattern":
      return collectPatternIdentifiers(node.left ?? null);
    default:
      return [];
  }
};

const collectForLoopVarIdentifiers = (
  node: ForStatement | ForOfOrInStatement,
): Identifier[] => {
  if (node.type === "ForStatement") {
    const init = node.init;
    if (init === null || init === undefined) {
      return [];
    }
    if ((init as { type: string }).type !== "VariableDeclaration") {
      return [];
    }
    const decl = init as VariableDeclaration;
    return decl.declarations.flatMap((v) => collectPatternIdentifiers(v.id));
  }
  const left = node.left;
  if ((left as { type: string }).type === "VariableDeclaration") {
    const decl = left as VariableDeclaration;
    return decl.declarations.flatMap((v) => collectPatternIdentifiers(v.id));
  }
  return [];
};

const forKindOf = (
  node: ForStatement | ForOfOrInStatement,
): "for" | "for-of" | "for-in" => {
  if (node.type === "ForOfStatement") {
    return "for-of";
  }
  if (node.type === "ForInStatement") {
    return "for-in";
  }
  return "for";
};

const outerDescriptorOf = (frame: IterationFrame): string => {
  if (frame.kind === "array-callback") {
    return `Array.prototype.${frame.methodName} callback`;
  }
  return `${frame.kind} loop`;
};

const rule: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Ban thoughtless single-character variable names in iteration contexts (Array.prototype callbacks, for / for-of / for-in).",
    },
    schema: [],
  },
  create(context) {
    const frameStack: IterationFrame[] = [];
    const callbackToFrame = new WeakMap<object, ArrayCallbackFrame>();
    const forNodeToFrame = new WeakMap<object, ForFrame>();

    const reportInnerArrayCallback = (
      param: Identifier,
      frame: ArrayCallbackFrame,
      paramIndex: number,
    ) => {
      const expected = expectedNamesFor(frame.methodKind)[paramIndex];
      if (expected === undefined) {
        return;
      }
      if (param.name.length >= 2) {
        return;
      }
      if (param.name === expected) {
        return;
      }
      context.report({
        message: `Array.prototype.${frame.methodName} expects '${expected}' for argument ${paramIndex + 1} (got: '${param.name}').`,
        node: param,
      });
    };

    const reportInnerFor = (param: Identifier, frame: ForFrame) => {
      if (param.name.length >= 2) {
        return;
      }
      if (FOR_ALLOWED_INNER.has(param.name)) {
        return;
      }
      context.report({
        message: `${frame.kind} loop variable '${param.name}' is not allowed; use 'k', 'v', 'i' or a meaningful name with 2 or more characters.`,
        node: param,
      });
    };

    const reportOuter = (param: Identifier, frame: IterationFrame) => {
      if (param.name.length >= 2) {
        return;
      }
      const descriptor = outerDescriptorOf(frame);
      context.report({
        message: `Avoid the single-character name '${param.name}' on an outer ${descriptor}; use a meaningful name with 2 or more characters.`,
        node: param,
      });
    };

    const markParentHasNested = () => {
      const top = frameStack[frameStack.length - 1];
      if (top !== undefined) {
        top.hasNested = true;
      }
    };

    const onCallEnter = (node: CallExpression) => {
      const methodName = getTargetMethodName(node);
      if (methodName === null) {
        return;
      }
      const callback = getCallbackFunction(node);
      if (callback === null) {
        return;
      }
      const methodKind = methodKindOf(methodName, callback.async === true);
      if (methodKind === null) {
        return;
      }
      const frame: ArrayCallbackFrame = {
        kind: "array-callback",
        methodKind,
        methodName,
        hasNested: false,
      };
      callbackToFrame.set(callback as unknown as object, frame);
      markParentHasNested();
    };

    const onFunctionEnter = (node: FunctionLike) => {
      const frame = callbackToFrame.get(node as unknown as object);
      if (frame === undefined) {
        return;
      }
      frameStack.push(frame);
    };

    const onFunctionExit = (node: FunctionLike) => {
      const frame = callbackToFrame.get(node as unknown as object);
      if (frame === undefined) {
        return;
      }
      const popped = frameStack.pop();
      if (popped !== frame) {
        return;
      }
      const expected = expectedNamesFor(frame.methodKind);
      const params = node.params;
      const limit = Math.min(params.length, expected.length);

      for (let i = 0; i < limit; i++) {
        const param = params[i];
        if (!isIdentifier(param)) {
          continue;
        }
        if (frame.hasNested) {
          reportOuter(param, frame);
        } else {
          reportInnerArrayCallback(param, frame, i);
        }
      }
    };

    const onForEnter = (node: ForStatement | ForOfOrInStatement) => {
      const frame: ForFrame = {
        kind: forKindOf(node),
        hasNested: false,
      };
      markParentHasNested();
      frameStack.push(frame);
      forNodeToFrame.set(node as unknown as object, frame);
    };

    const onForExit = (node: ForStatement | ForOfOrInStatement) => {
      const frame = forNodeToFrame.get(node as unknown as object);
      if (frame === undefined) {
        return;
      }
      const popped = frameStack.pop();
      if (popped !== frame) {
        return;
      }
      const params = collectForLoopVarIdentifiers(node);
      for (const param of params) {
        if (frame.hasNested) {
          reportOuter(param, frame);
        } else {
          reportInnerFor(param, frame);
        }
      }
    };

    return {
      CallExpression: onCallEnter as unknown as (node: never) => void,
      ArrowFunctionExpression: onFunctionEnter as unknown as (
        node: never,
      ) => void,
      "ArrowFunctionExpression:exit": onFunctionExit as unknown as (
        node: never,
      ) => void,
      FunctionExpression: onFunctionEnter as unknown as (node: never) => void,
      "FunctionExpression:exit": onFunctionExit as unknown as (
        node: never,
      ) => void,
      ForStatement: onForEnter as unknown as (node: never) => void,
      "ForStatement:exit": onForExit as unknown as (node: never) => void,
      ForOfStatement: onForEnter as unknown as (node: never) => void,
      "ForOfStatement:exit": onForExit as unknown as (node: never) => void,
      ForInStatement: onForEnter as unknown as (node: never) => void,
      "ForInStatement:exit": onForExit as unknown as (node: never) => void,
    };
  },
};

const plugin = {
  meta: { name: "crescware-iteration-var-names" },
  rules: {
    "iteration-var-names": rule,
  },
};

export default plugin;
