import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters
} from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { env } from "./config.js";

export function mediaBlobClient(blobName: string) {
  const account = env("MEDIA_STORAGE_ACCOUNT");
  const container = env("MEDIA_CONTAINER", "report-media");
  if (!account) throw new Error("MEDIA_STORAGE_ACCOUNT missing");
  const service = new BlobServiceClient(`https://${account}.blob.core.windows.net`, new DefaultAzureCredential());
  const blob = service.getContainerClient(container).getBlockBlobClient(blobName);
  return { account, container, service, blob };
}

export async function mediaReadUrl(blobName: string, ttlMs = 15 * 60 * 1000): Promise<string> {
  const { account, container, service, blob } = mediaBlobClient(blobName);
  const startsOn = new Date(Date.now() - 5 * 60 * 1000);
  const expiresOn = new Date(Date.now() + ttlMs);
  const delegationKey = await service.getUserDelegationKey(startsOn, expiresOn);
  const sas = generateBlobSASQueryParameters({
    containerName: container,
    blobName,
    startsOn,
    expiresOn,
    permissions: BlobSASPermissions.parse("r")
  }, delegationKey, account).toString();
  return `${blob.url}?${sas}`;
}

export async function deleteMediaBlob(blobName: string): Promise<void> {
  const { blob } = mediaBlobClient(blobName);
  await blob.deleteIfExists({ deleteSnapshots: "include" });
}
