// Minimal JSON Schema (2020-12 subset) evaluator for orchestration/schemas/handoff.schema.json.
// It exists so the contract can be tested without a dependency. It throws on any keyword it
// does not implement, so extending the schema forces extending this file.

const ANNOTATIONS = new Set(["$schema", "$id", "$defs", "title", "description", "format"]);

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const typeOf = (v, t) =>
  t === "null" ? v === null
  : t === "object" ? isObject(v)
  : t === "array" ? Array.isArray(v)
  : t === "integer" ? Number.isInteger(v)
  : typeof v === t;

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function validate(schema, data) {
  const resolve = (ref) => {
    if (!ref.startsWith("#/")) throw new Error(`Unsupported $ref: ${ref}`);
    return ref.slice(2).split("/").reduce((node, key) => node[key], schema);
  };

  const check = (s, v) => {
    if (s === true) return true;
    for (const [key, arg] of Object.entries(s)) {
      if (ANNOTATIONS.has(key)) continue;
      switch (key) {
        case "$ref": if (!check(resolve(arg), v)) return false; break;
        case "type": if (![].concat(arg).some((t) => typeOf(v, t))) return false; break;
        case "const": if (!equal(v, arg)) return false; break;
        case "enum": if (!arg.some((x) => equal(x, v))) return false; break;
        case "allOf": if (!arg.every((x) => check(x, v))) return false; break;
        case "anyOf": if (!arg.some((x) => check(x, v))) return false; break;
        case "oneOf": if (arg.filter((x) => check(x, v)).length !== 1) return false; break;
        case "not": if (check(arg, v)) return false; break;
        case "if": break; // evaluated together with then/else
        case "then":
        case "else": {
          if (!("if" in s)) break;
          const matched = check(s.if, v);
          if ((key === "then") === matched && !check(arg, v)) return false;
          break;
        }
        case "required": if (isObject(v) && !arg.every((k) => k in v)) return false; break;
        case "properties":
          if (isObject(v)) for (const [k, sub] of Object.entries(arg)) if (k in v && !check(sub, v[k])) return false;
          break;
        case "additionalProperties":
          if (arg !== false) throw new Error("Only additionalProperties: false is supported");
          if (isObject(v) && Object.keys(v).some((k) => !(k in (s.properties ?? {})))) return false;
          break;
        case "items": if (Array.isArray(v) && !v.every((x) => check(arg, x))) return false; break;
        case "contains": if (Array.isArray(v) && !v.some((x) => check(arg, x))) return false; break;
        case "minimum": if (typeof v === "number" && v < arg) return false; break;
        case "maximum": if (typeof v === "number" && v > arg) return false; break;
        case "minLength": if (typeof v === "string" && v.length < arg) return false; break;
        case "maxLength": if (typeof v === "string" && v.length > arg) return false; break;
        case "pattern": if (typeof v === "string" && !new RegExp(arg).test(v)) return false; break;
        default: throw new Error(`Unsupported schema keyword: ${key}`);
      }
    }
    return true;
  };

  return check(schema, data);
}
