import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { AnalyticsRepository } from '../../src/analytics/analytics.repository';
import { AnalyticsService } from '../../src/analytics/analytics.service';
import { CheckinsFlowService } from '../../src/checkins/checkins.flow';
import { CheckinsRepository } from '../../src/checkins/checkins.repository';
import { CheckinsService } from '../../src/checkins/checkins.service';
import { DailyMetricsRepository } from '../../src/daily-metrics/daily-metrics.repository';
import { DailyMetricsService } from '../../src/daily-metrics/daily-metrics.service';
import { EventsFlowService } from '../../src/events/events.flow';
import { EventsRepository } from '../../src/events/events.repository';
import { EventsService } from '../../src/events/events.service';
import { FsmRepository } from '../../src/fsm/fsm.repository';
import { FsmService } from '../../src/fsm/fsm.service';
import { OnboardingFlow } from '../../src/onboarding/onboarding.flow';
import { OnboardingService } from '../../src/onboarding/onboarding.service';
import { RemindersService } from '../../src/reminders/reminders.service';
import { StatsService } from '../../src/stats/stats.service';
import { SummariesFormatter } from '../../src/summaries/summaries.formatter';
import { SummariesRepository } from '../../src/summaries/summaries.repository';
import { SummariesService } from '../../src/summaries/summaries.service';
import { TagsRepository } from '../../src/tags/tags.repository';
import { TagsService } from '../../src/tags/tags.service';
import { UsersRepository } from '../../src/users/users.repository';
import { UsersService } from '../../src/users/users.service';
import {
  InMemoryAnalyticsRepository,
  InMemoryCheckinsRepository,
  InMemoryDailyMetricsRepository,
  InMemoryEventsRepository,
  InMemoryFsmRepository,
  InMemorySummariesRepository,
  InMemoryTagsRepository,
  InMemoryUsersRepository,
  createConfigService,
} from './in-memory';

export interface IntegrationTestContext {
  moduleRef: TestingModule;
  configService: ConfigService;
  usersRepository: InMemoryUsersRepository;
  fsmRepository: InMemoryFsmRepository;
  checkinsRepository: InMemoryCheckinsRepository;
  eventsRepository: InMemoryEventsRepository;
  tagsRepository: InMemoryTagsRepository;
  analyticsRepository: InMemoryAnalyticsRepository;
  summariesRepository: InMemorySummariesRepository;
  dailyMetricsRepository: InMemoryDailyMetricsRepository;
  usersService: UsersService;
  dailyMetricsService: DailyMetricsService;
  fsmService: FsmService;
  tagsService: TagsService;
  checkinsService: CheckinsService;
  analyticsService: AnalyticsService;
  remindersService: RemindersService;
  onboardingService: OnboardingService;
  onboardingFlow: OnboardingFlow;
  checkinsFlow: CheckinsFlowService;
  eventsService: EventsService;
  eventsFlow: EventsFlowService;
  statsService: StatsService;
  summariesService: SummariesService;
  summariesFormatter: SummariesFormatter;
}

export async function createIntegrationTestContext(
  overrides: Record<string, unknown> = {},
): Promise<IntegrationTestContext> {
  const configService = createConfigService(overrides);
  const usersRepository = new InMemoryUsersRepository();
  const fsmRepository = new InMemoryFsmRepository();
  const checkinsRepository = new InMemoryCheckinsRepository();
  const eventsRepository = new InMemoryEventsRepository();
  const tagsRepository = new InMemoryTagsRepository();
  const analyticsRepository = new InMemoryAnalyticsRepository();
  const summariesRepository = new InMemorySummariesRepository();
  const dailyMetricsRepository = new InMemoryDailyMetricsRepository();

  const moduleRef = await Test.createTestingModule({
    providers: [
      { provide: ConfigService, useValue: configService },
      { provide: UsersRepository, useValue: usersRepository },
      { provide: DailyMetricsRepository, useValue: dailyMetricsRepository },
      { provide: FsmRepository, useValue: fsmRepository },
      { provide: CheckinsRepository, useValue: checkinsRepository },
      { provide: EventsRepository, useValue: eventsRepository },
      { provide: TagsRepository, useValue: tagsRepository },
      { provide: AnalyticsRepository, useValue: analyticsRepository },
      { provide: SummariesRepository, useValue: summariesRepository },
      UsersService,
      DailyMetricsService,
      FsmService,
      TagsService,
      CheckinsService,
      AnalyticsService,
      RemindersService,
      OnboardingService,
      OnboardingFlow,
      CheckinsFlowService,
      EventsService,
      EventsFlowService,
      StatsService,
      SummariesFormatter,
      SummariesService,
    ],
  }).compile();

  return {
    moduleRef,
    configService,
    usersRepository,
    fsmRepository,
    checkinsRepository,
    eventsRepository,
    tagsRepository,
    analyticsRepository,
    summariesRepository,
    dailyMetricsRepository,
    usersService: moduleRef.get(UsersService),
    dailyMetricsService: moduleRef.get(DailyMetricsService),
    fsmService: moduleRef.get(FsmService),
    tagsService: moduleRef.get(TagsService),
    checkinsService: moduleRef.get(CheckinsService),
    analyticsService: moduleRef.get(AnalyticsService),
    remindersService: moduleRef.get(RemindersService),
    onboardingService: moduleRef.get(OnboardingService),
    onboardingFlow: moduleRef.get(OnboardingFlow),
    checkinsFlow: moduleRef.get(CheckinsFlowService),
    eventsService: moduleRef.get(EventsService),
    eventsFlow: moduleRef.get(EventsFlowService),
    statsService: moduleRef.get(StatsService),
    summariesService: moduleRef.get(SummariesService),
    summariesFormatter: moduleRef.get(SummariesFormatter),
  };
}
