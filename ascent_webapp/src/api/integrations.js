import { ascent } from './client';

// Export integrations
export const Core = ascent.integrations.Core;

export const InvokeLLM = ascent.integrations.Core.InvokeLLM;
export const SendEmail = ascent.integrations.Core.SendEmail;
export const SendSMS = ascent.integrations.Core.SendSMS;
export const UploadFile = ascent.integrations.Core.UploadFile;
export const GenerateImage = ascent.integrations.Core.GenerateImage;
export const ExtractDataFromUploadedFile = ascent.integrations.Core.ExtractDataFromUploadedFile;
