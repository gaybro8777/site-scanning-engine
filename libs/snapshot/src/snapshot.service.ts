import { Injectable, Logger } from '@nestjs/common';
import { WebsiteService } from '@app/database/websites/websites.service';
import { StorageService } from '@app/storage';
import { DatetimeService } from 'libs/datetime/src';
import { Snapshot } from './snapshot';
import { JsonSerializer } from './serializers/json-serializer';
import { CsvSerializer } from './serializers/csv-serializer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SnapshotService {
  private logger = new Logger(SnapshotService.name);

  constructor(
    private storageService: StorageService,
    private websiteService: WebsiteService,
    private datetimeService: DatetimeService,
    private configService: ConfigService,
  ) {}

  private fileNameLive = this.configService.get<string>('fileNameLive');
  private fileNameAll = this.configService.get<string>('fileNameAll');

  /**
   * weeklySnapshot is meant to be called weekly. It takes two snapshots:
   * - weekly-snapshot-all: contains all Website and CoreResults
   * - weekly-snapshot: contains only Website and CoreResults where
   *   CoreResult.finalUrlIsLive === true
   *
   * If there are existing snapshots, they are copied to the archive bucket, and
   * named as such: weekly-snapshot-<date-one-week-previous>.
   *
   * The particular filename is specified by /config/snapshot.config.ts,
   * depending on whichever environment the application is running in.
   */
  async weeklySnapshot() {
    const date = this.datetimeService.now();
    date.setDate(date.getDate() - 7);
    const priorDate = date.toISOString();

    const allWebsites = new Snapshot(
      this.storageService,
      [new JsonSerializer(), new CsvSerializer(Snapshot.CSV_COLUMN_ORDER)],
      await this.websiteService.findAllWebsiteResults(),
      priorDate,
      this.fileNameAll,
    );

    const liveWebsites = new Snapshot(
      this.storageService,
      [new JsonSerializer(), new CsvSerializer(Snapshot.CSV_COLUMN_ORDER)],
      await this.websiteService.findLiveWebsiteResults(),
      priorDate,
      this.fileNameLive,
    );

    await Promise.all([
      await allWebsites.archivePriorSnapshot(),
      await allWebsites.saveNewSnapshot(),
      await liveWebsites.archivePriorSnapshot(),
      await liveWebsites.saveNewSnapshot(),
    ]);
  }
}
