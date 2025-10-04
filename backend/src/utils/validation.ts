import type { ZodIssue, ZodType, ZodTypeDef } from 'zod';
import { ValidationError } from '@/services';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: FormattedIssue[];
}

export interface FormattedIssue {
  path: string;
  message: string;
  code: string;
}

export const formatIssues = (issues: ZodIssue[]): FormattedIssue[] =>
  issues.map(issue => ({
    path: issue.path.join('.') || '<root>',
    message: issue.message,
    code: issue.code,
  }));

export const validateSchema = <Output, Input, Schema extends ZodType<Output, ZodTypeDef, Input>>(
  schema: Schema,
  data: unknown
): ValidationResult<Output> => {
  const result = schema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    errors: formatIssues(result.error.issues),
  };
};

export const ensureValid = <Output, Input, Schema extends ZodType<Output, ZodTypeDef, Input>>(
  schema: Schema,
  data: unknown,
  message = 'Validation failed'
): Output => {
  const result = schema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  throw new ValidationError(message, result.error.issues, {
    errors: formatIssues(result.error.issues),
  });
};
