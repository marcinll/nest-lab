import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { of } from 'rxjs';
import * as supertest from 'supertest';

import { CanActivate } from '@nestjs/common';
import { AndGuard } from '../src/lib/and.guard';
import { OrGuard } from '../src/lib/or.guard';
import { AppModule } from './app.module';
import { ObsGuard } from './obs.guard';
import { PromGuard } from './prom.guard';
import { SyncGuard } from './sync.guard';

describe('OrGuard and AndGuard Integration Test', () => {
  let moduleConfig: TestingModuleBuilder;

  beforeEach(() => {
    moduleConfig = Test.createTestingModule({
      imports: [AppModule],
    });
  });

  describe.each`
    sync     | syncExpect
    ${true}  | ${true}
    ${false} | ${false}
  `(
    'sync val $sync syncExpect $syncExpect',
    ({ sync, syncExpect }: { sync: boolean; syncExpect: boolean }) => {
      describe.each`
        prom     | promExpect
        ${true}  | ${true}
        ${false} | ${false}
      `(
        'prom val $prom promExpect $promExpect',
        ({ prom, promExpect }: { prom: boolean; promExpect: boolean }) => {
          describe.each`
            obs      | obsExpect
            ${true}  | ${true}
            ${false} | ${syncExpect && promExpect}
          `(
            'obs val $obs final expect $obsExpect',
            ({ obs, obsExpect }: { obs: boolean; obsExpect: boolean }) => {
              let app: INestApplication;
              beforeEach(async () => {
                const testMod = await moduleConfig
                  .overrideProvider(SyncGuard)
                  .useValue({ canActivate: () => sync })
                  .overrideProvider(PromGuard)
                  .useValue({ canActivate: async () => prom })
                  .overrideProvider(ObsGuard)
                  .useValue({ canActivate: () => of(obs) })
                  .compile();
                app = testMod.createNestApplication();
                await app.init();
              });
              afterEach(async () => {
                await app.close();
              });
              /**
               * OrGuard([AndGuard([SyncGuard, PromGuard]), ObsGuard])
               *
               * | Sync | Prom | Obs | Final |
               * |  - | - | - | - |
               * | true | true | true | true |
               * | true | true | false | true |
               * | true | false | true | true |
               * | true | false | false | false |
               * | false | true | true | true |
               * | false | true | false | false |
               * | false | false | true | true |
               * | false  | false | false | false |
               */
              it(`should make a request to the server and${
                obsExpect ? ' ' : ' not '
              }succeed`, async () => {
                return supertest(app.getHttpServer())
                  .get('/logical-and')
                  .expect(obsExpect ? 200 : 403);
              });
            }
          );
        }
      );
      describe.each`
        prom     | promExpect
        ${true}  | ${true}
        ${false} | ${syncExpect ?? false}
      `(
        'prom val $prom promExpect $promExpect',
        ({ prom, promExpect }: { prom: boolean; promExpect: boolean }) => {
          describe.each`
            obs      | obsExpect
            ${true}  | ${true}
            ${false} | ${promExpect ?? false}
          `(
            'obs val $obs final expect $obsExpect',
            ({ obs, obsExpect }: { obs: boolean; obsExpect: boolean }) => {
              let app: INestApplication;
              beforeEach(async () => {
                const testMod = await moduleConfig
                  .overrideProvider(SyncGuard)
                  .useValue({ canActivate: () => sync })
                  .overrideProvider(PromGuard)
                  .useValue({ canActivate: async () => prom })
                  .overrideProvider(ObsGuard)
                  .useValue({ canActivate: () => of(obs) })
                  .compile();
                app = testMod.createNestApplication();
                await app.init();
              });
              afterEach(async () => {
                await app.close();
              });
              /**
               * OrGuard([SyncGuard, PromGuard, ObsGuard])
               *
               * | Sync | Prom | Obs | Final |
               * |  - | - | - | - |
               * | true | true | true | true |
               * | true | true | false | true |
               * | true | false | true | true |
               * | true | false | false | true |
               * | false | true | true | true |
               * | false | true | false | true |
               * | false | false | true | true |
               * | false  | false | false | false |
               */
              it(`should make a request to the server and${
                obsExpect ? ' ' : ' not '
              }succeed`, async () => {
                return supertest(app.getHttpServer())
                  .get('/')
                  .expect(obsExpect ? 200 : 403);
              });
            }
          );
        }
      );
      describe('Using the throw guards', () => {
        let app: INestApplication;
        beforeEach(async () => {
          const testMod = await moduleConfig
            .overrideProvider(SyncGuard)
            .useValue({ canActivate: () => sync })
            .compile();
          app = testMod.createNestApplication();
          await app.init();
        });
        afterEach(async () => {
          await app.close();
        });
        describe('do-not-throw', () => {
          /**
           * OrGuard([SyncGuard, ThrowGuard])
           *
           * | Sync | Throw | Final |
           * | - | - | - |
           * | true | UnauthorizedException | true |
           * | false | UnauthorizedException | false |
           */
          it(`should return with ${syncExpect ? 200 : 403}`, async () => {
            return supertest(app.getHttpServer())
              .get('/do-not-throw')
              .expect(syncExpect ? 200 : 403);
          });
        });
        describe('throw', () => {
          /**
           * OrGuard([SyncGuard, ThrowGuard], { throwOnFirstError: true})
           *
           * | Sync | Throw | Final |
           * | - | - | - |
           * | true | UnauthorizedException | false |
           * | false | UnauthorizedException | false |
           */
          it('should throw an error regardless of syncExpect', async () => {
            return supertest(app.getHttpServer())
              .get('/throw')
              .expect(401)
              .expect(({ body }) => {
                expect(body).toEqual(
                  expect.objectContaining({ message: 'ThrowGuard' })
                );
              });
          });
        });
        describe('throw-last', () => {
          /**
           * OrGuard([SyncGuard, ThrowGuard], { throwLastError: true })
           *
           * | Sync | Throw | Final |
           * | - | - | - |
           * | true | UnauthorizedException | true |
           * | false | UnauthorizedException | UnauthorizedException |
           */
          it('should throw the last error', async () => {
            return supertest(app.getHttpServer())
              .get('/throw-last')
              .expect(sync ? 200 : 401)
              .expect(({ body }) => {
                if (!sync) {
                  expect(body).toEqual(
                    expect.objectContaining({ message: 'ThrowGuard' })
                  );
                }
              });
          });
        });
        describe('throw-custom', () => {
          /**
           * OrGuard([ThrowGuard, ThrowGuard], { throwError: new UnauthorizedException('Should provide either "x-api-key" header or query') })
           *
           * | Throw | Throw | Final |
           * | - | - | - |
           * | UnauthorizedException | UnauthorizedException | object |
           * | UnauthorizedException | UnauthorizedException | object |
           */
          it('should throw the custom error', async () => {
            return supertest(app.getHttpServer())
              .get('/throw-custom')
              .expect(401)
              .expect(({ body }) => {
                expect(body).toEqual(
                  expect.objectContaining({
                    message:
                      'Should provide either "x-api-key" header or query',
                  })
                );
              });
          });
        });
        describe('throw-custom-narrow', () => {
          /**
           * OrGuard([ThrowGuard, ThrowGuard], { throwError: (errors) => new UnauthorizedException((errors as { message?: string }[]).filter(error => error.message).join(', ')) })
           *
           * | Throw | Throw | Final |
           * | - | - | - |
           * | UnauthorizedException | UnauthorizedException | UnauthorizedException |
           * | UnauthorizedException | UnauthorizedException | unknown |
           */
          it('should throw the custom error', async () => {
            return supertest(app.getHttpServer())
              .get('/throw-custom-narrow')
              .expect(401)
              .expect(({ body }) => {
                expect(body).toEqual(
                  expect.objectContaining({
                    message:
                      'UnauthorizedException: ThrowGuard, UnauthorizedException: ThrowGuard',
                  })
                );
              });
          });
        });
      });
    }
  );

  describe('AndGuard with options', () => {
    let app: INestApplication;
    beforeAll(async () => {
      const testMod = await moduleConfig.compile();
      app = testMod.createNestApplication();
      await app.init();
    });
    afterAll(async () => {
      await app.close();
    });
    it('should throw an error if not ran sequentially', async () => {
      return supertest(app.getHttpServer()).get('/set-user-fail').expect(403);
    });
    it('should not throw an error if ran sequentially', async () => {
      return supertest(app.getHttpServer()).get('/set-user-pass').expect(200);
    });
  });

  describe('Guard Name Generation', () => {
    class TestGuard1 implements CanActivate {
      canActivate() {
        return true;
      }
    }

    class TestGuard2 implements CanActivate {
      canActivate() {
        return true;
      }
    }

    const TOKEN = 'TEST_TOKEN';

    it('should generate correct name for OrGuard with class guards', () => {
      const guard = OrGuard([TestGuard1, TestGuard2]);
      expect(guard.name).toBe('OrGuard(TestGuard1TestGuard2)');
    });

    it('should generate correct name for OrGuard with token', () => {
      const guard = OrGuard([TestGuard1, TOKEN]);
      expect(guard.name).toBe('OrGuard(TestGuard1TEST_TOKEN)');
    });

    it('should generate correct name for AndGuard with class guards', () => {
      const guard = AndGuard([TestGuard1, TestGuard2]);
      expect(guard.name).toBe('AndGuard(TestGuard1TestGuard2)');
    });

    it('should generate correct name for AndGuard with token', () => {
      const guard = AndGuard([TestGuard1, TOKEN]);
      expect(guard.name).toBe('AndGuard(TestGuard1TEST_TOKEN)');
    });

    it('should handle unknown token types by generating uid', () => {
      const symbolToken = Symbol('TEST');
      const guard = OrGuard([TestGuard1, symbolToken]);
      expect(guard.name).toMatch(/^OrGuard\(TestGuard1[a-zA-Z0-9]{21}\)$/);
    });
  });
});
