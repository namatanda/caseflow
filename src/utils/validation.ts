import type { ZodIssue, ZodSchema, ZodTypeAny } from 'zod';
import { ZodError } from 'zod';
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

export const validateSchema = <T extends ZodTypeAny>(schema: T, data: unknown): ValidationResult<ReturnType<T['parse']>> => {
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

export const ensureValid = <T>(schema: ZodSchema<T>, data: unknown, message = 'Validation failed'): T => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError(message, error.issues, {
        errors: formatIssues(error.issues),
      });
    }

    throw error;
  }
};
