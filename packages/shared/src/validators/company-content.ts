import { z } from "zod";

export const createCompanyStaffSchema = z.object({
  name: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  photoAssetId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type CreateCompanyStaff = z.infer<typeof createCompanyStaffSchema>;

export const updateCompanyStaffSchema = createCompanyStaffSchema.partial();
export type UpdateCompanyStaff = z.infer<typeof updateCompanyStaffSchema>;

export const createCompanyEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(300).nullable().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  timeRange: z.string().trim().max(120).nullable().optional(),
  ageRange: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  flyerAssetId: z.string().uuid().nullable().optional(),
  registrationUrl: z.string().trim().url().nullable().optional(),
  isPublished: z.boolean().optional(),
});
export type CreateCompanyEvent = z.infer<typeof createCompanyEventSchema>;

export const updateCompanyEventSchema = createCompanyEventSchema.partial();
export type UpdateCompanyEvent = z.infer<typeof updateCompanyEventSchema>;
