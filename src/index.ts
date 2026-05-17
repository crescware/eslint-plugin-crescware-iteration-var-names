type Position = { line: number; column: number };
type Loc = { start: Position; end: Position };

type Identifier = { type: "Identifier"; name: string; loc?: Loc };

type Param = { type: string; loc?: Loc; name?: string };

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

type Frame = { kind: MethodKind; methodName: string; hasNested: boolean };

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

const rule: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Enforce naming convention for Array.prototype callback arguments (v/i/arr, acc, prev, a/b).",
    },
    schema: [],
  },
  create(context) {
    const callbackStack: Frame[] = [];
    const callbackToFrame = new WeakMap<object, Frame>();

    const reportInner = (
      param: Identifier,
      methodName: string,
      kind: MethodKind,
      paramIndex: number,
    ) => {
      const expected = expectedNamesFor(kind)[paramIndex];
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
        message: `Array.prototype.${methodName} expects '${expected}' for argument ${paramIndex + 1} (got: '${param.name}').`,
        node: param,
      });
    };

    const reportOuter = (param: Identifier, methodName: string) => {
      if (param.name.length >= 2) {
        return;
      }
      context.report({
        message: `Avoid the single-character name '${param.name}' on an outer Array.prototype.${methodName} callback; use a meaningful name with 2 or more characters.`,
        node: param,
      });
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
      const kind = methodKindOf(methodName, callback.async === true);
      if (kind === null) {
        return;
      }
      const frame: Frame = { kind, methodName, hasNested: false };
      callbackToFrame.set(callback as unknown as object, frame);
      const top = callbackStack[callbackStack.length - 1];
      if (top !== undefined) {
        top.hasNested = true;
      }
    };

    const onFunctionEnter = (node: FunctionLike) => {
      const frame = callbackToFrame.get(node as unknown as object);
      if (frame === undefined) {
        return;
      }
      callbackStack.push(frame);
    };

    const onFunctionExit = (node: FunctionLike) => {
      const frame = callbackToFrame.get(node as unknown as object);
      if (frame === undefined) {
        return;
      }
      const popped = callbackStack.pop();
      if (popped !== frame) {
        return;
      }
      const expected = expectedNamesFor(frame.kind);
      const params = node.params;
      const limit = Math.min(params.length, expected.length);

      for (let i = 0; i < limit; i++) {
        const param = params[i];
        if (!isIdentifier(param)) {
          continue;
        }
        if (frame.hasNested) {
          reportOuter(param, frame.methodName);
        } else {
          reportInner(param, frame.methodName, frame.kind, i);
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
    };
  },
};

const plugin = {
  meta: { name: "crescware-iteration-var-names" },
  rules: {
    "array-callback-arg-names": rule,
  },
};

export default plugin;
