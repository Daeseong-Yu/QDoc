import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { AuthModule } from './auth/auth.module'
import { HospitalsModule } from './hospitals/hospitals.module'
import { PrismaModule } from './prisma/prisma.module'
import { QueueModule } from './queue/queue.module'
import { SymptomsModule } from './symptoms/symptoms.module'
import { UiPathModule } from './uipath/uipath.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      expandVariables: true,
    }),
    PrismaModule,
    AuthModule,
    HospitalsModule,
    QueueModule,
    SymptomsModule,
    UiPathModule,
  ],
})
export class AppModule {}
