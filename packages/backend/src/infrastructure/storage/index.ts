import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import path from 'path';
import { config } from '../../core/config';
import { logger } from '../../core/logger';
import { safePath } from '../../core/security/sanitize';

export interface StorageFile {
  key: string;
  content: Buffer | string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface StorageProvider {
  put(file: StorageFile): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
}

// S3-compatible storage (works with AWS S3, MinIO, DigitalOcean Spaces)
class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = config.S3_BUCKET || 'buildcraft-storage';
    this.client = new S3Client({
      region: config.S3_REGION || 'us-east-1',
      endpoint: config.S3_ENDPOINT || undefined,
      forcePathStyle: !!config.S3_ENDPOINT, // Required for MinIO
      credentials: config.AWS_ACCESS_KEY_ID ? {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY || '',
      } : undefined,
    });
  }

  async put(file: StorageFile): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: file.key,
      Body: typeof file.content === 'string' ? Buffer.from(file.content) : file.content,
      ContentType: file.contentType || 'application/octet-stream',
      Metadata: file.metadata,
    });
    await this.client.send(command);
    logger.debug('File uploaded to S3', { key: file.key });
    return file.key;
  }

  async get(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const response = await this.client.send(command);
    const stream = response.Body as any;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) { chunks.push(Buffer.from(chunk)); }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({ Bucket: this.bucket, Key: key });
    await this.client.send(command);
    logger.debug('File deleted from S3', { key });
  }

  async list(prefix: string): Promise<string[]> {
    const command = new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix });
    const response = await this.client.send(command);
    return (response.Contents || []).map((obj) => obj.Key!).filter(Boolean);
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn });
  }
}

// Local filesystem storage (development)
class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor() {
    this.basePath = path.resolve(process.cwd(), 'storage');
  }

  async put(file: StorageFile): Promise<string> {
    // Path traversal protection: validate key stays within basePath
    const filePath = safePath(this.basePath, file.key);
    await mkdir(path.dirname(filePath), { recursive: true });
    const content = typeof file.content === 'string' ? file.content : file.content;
    await writeFile(filePath, content);
    logger.debug('File saved locally', { key: file.key });
    return file.key;
  }

  async get(key: string): Promise<Buffer> {
    const filePath = safePath(this.basePath, key);
    return readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = safePath(this.basePath, key);
    await unlink(filePath);
  }

  async list(prefix: string): Promise<string[]> {
    const { glob } = await import('glob');
    const safePrefix = safePath(this.basePath, prefix);
    const pattern = path.join(safePrefix, '**/*');
    const files = await glob(pattern, { nodir: true });
    return files.map((f) => path.relative(this.basePath, f));
  }

  async getSignedUrl(key: string): Promise<string> {
    return `/storage/${key}`; // For local dev, serve via express static
  }
}

// Factory
let storageInstance: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!storageInstance) {
    const provider = config.STORAGE_PROVIDER || 'local';
    storageInstance = provider === 's3' ? new S3StorageProvider() : new LocalStorageProvider();
    logger.info(`Storage provider initialized: ${provider}`);
  }
  return storageInstance;
}
