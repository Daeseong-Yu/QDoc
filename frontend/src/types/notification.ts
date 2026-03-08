export type NotificationTriggerMode = 'people' | 'time'

export type NotificationSettings = {
  inAppEnabled: true
  voiceEnabled: boolean
  triggerMode: NotificationTriggerMode
  stage1People: number
  stage2People: number
  stage1Minutes: number
  stage2Minutes: number
  phoneNumber: string
  phoneVerified: boolean
}
