import { Inject, Injectable, NotFoundException } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { UpsertUiPathSnapshotDto } from './dto/upsert-snapshot.dto'

@Injectable()
export class UiPathService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async ingestSnapshot(payload: UpsertUiPathSnapshotDto) {
    const hospital = await this.prisma.hospital.findUnique({
      where: {
        id: payload.hospitalId,
      },
    })

    if (!hospital) {
      throw new NotFoundException('Hospital not found')
    }

    if (payload.queueId) {
      const queue = await this.prisma.queue.findUnique({
        where: {
          id: payload.queueId,
        },
      })

      if (!queue || queue.hospitalId !== payload.hospitalId) {
        throw new NotFoundException('Queue not found in hospital')
      }
    }

    const capturedAt = payload.capturedAt ? new Date(payload.capturedAt) : new Date()

    const snapshot = await this.prisma.waitTimeSnapshot.create({
      data: {
        hospitalId: payload.hospitalId,
        queueId: payload.queueId,
        source: payload.source ?? 'UiPath',
        averageMinutes: payload.averageMinutes,
        waitingCount: payload.waitingCount,
        capturedAt,
      },
    })

    return snapshot
  }

  async getLatestSnapshots() {
    const hospitals = await this.prisma.hospital.findMany({
      include: {
        waitSnapshots: {
          orderBy: {
            capturedAt: 'desc',
          },
          take: 1,
        },
      },
      orderBy: {
        name: 'asc',
      },
    })

    return hospitals.map((hospital) => ({
      hospitalId: hospital.id,
      hospitalName: hospital.name,
      latestSnapshot: hospital.waitSnapshots[0] ?? null,
      latestUpdatedAt: hospital.waitSnapshots[0]?.capturedAt.toISOString() ?? hospital.updatedAt.toISOString(),
    }))
  }
}

