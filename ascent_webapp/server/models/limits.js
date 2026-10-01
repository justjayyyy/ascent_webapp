// Upper bounds for every model, so no field can be used to store megabytes or absurd numbers. Each model file
// imports this first; it registers a mongoose plugin that applies when the model is compiled (sub-documents too).
// A field with its own maxlength keeps it. Validators run on create, insertMany and updates with runValidators.
import mongoose from 'mongoose';

export const LIMITS = {
  string: 10_000, // characters, unless the field sets its own maxlength
  number: 1e15, // magnitude; also rules out Infinity (timestamps in ms still fit)
  array: 5_000, // elements
  mixed: 50_000, // characters of JSON for free-form fields
};

const tooLong = (v) => v != null && String(v).length > LIMITS.string;
const badNumber = (v) => v != null && !(Number.isFinite(v) && Math.abs(v) <= LIMITS.number);

export function limitsPlugin(schema) {
  schema.eachPath((name, type) => {
    switch (type.instance) {
      case 'String':
        if (!type.options?.maxlength) type.validate({ validator: (v) => !tooLong(v), message: `${name} is too long` });
        break;
      case 'Number':
        type.validate({ validator: (v) => !badNumber(v), message: `${name} is out of range` });
        break;
      case 'Array':
        type.validate({ validator: (v) => v == null || v.length <= LIMITS.array, message: `${name} has too many entries` });
        if (type.caster?.instance === 'String' && !type.caster.options?.maxlength) {
          type.validate({ validator: (v) => !(v || []).some(tooLong), message: `${name} has an entry that is too long` });
        }
        if (type.caster?.instance === 'Number') {
          type.validate({ validator: (v) => !(v || []).some(badNumber), message: `${name} has an entry out of range` });
        }
        break;
      case 'Mixed':
        type.validate({ validator: (v) => v == null || JSON.stringify(v).length <= LIMITS.mixed, message: `${name} is too large` });
        break;
      default:
    }
  });
}

mongoose.plugin(limitsPlugin);
