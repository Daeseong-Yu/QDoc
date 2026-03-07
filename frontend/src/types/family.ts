export type FamilyMember = {
  id: string
  name: string
  birthDate: string
  relation: string
  contact: string
}

export type FamilyMemberInput = Omit<FamilyMember, 'id'>
