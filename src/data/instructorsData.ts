import type { Instructor } from '../types';

export const sampleInstructors: Instructor[] = [
  { id: 'in-kim', name: '김도현', expertise: ['리더십', '조직개발'], phone: '010-1000-0001', email: 'kim@sam.com', defaultFee: 1500000, accountInfo: '국민 123-456-789', memo: '임원 대상 강의 선호' },
  { id: 'in-lee', name: '이서연', expertise: ['생성형AI', '실습'], phone: '010-1000-0002', email: 'lee@sam.com', defaultFee: 1800000, accountInfo: '신한 110-222-333' },
  { id: 'in-park', name: '박준영', expertise: ['팀빌딩', '커뮤니케이션'], phone: '010-1000-0003', defaultFee: 1200000, accountInfo: '우리 1002-333-444' },
  { id: 'in-choi', name: '최민지', expertise: ['회복탄력성', '심리'], phone: '010-1000-0004', email: 'choi@sam.com', defaultFee: 1300000 },
  { id: 'in-jung', name: '정우성', expertise: ['영업', '세일즈'], phone: '010-1000-0005', defaultFee: 1600000, accountInfo: '하나 333-444-555' },
  { id: 'in-han', name: '한가람', expertise: ['공공교육', '공무원'], phone: '010-1000-0006', email: 'han@sam.com', defaultFee: 1100000 },
  { id: 'in-oh', name: '오지훈', expertise: ['DX', '디지털전환'], phone: '010-1000-0007', defaultFee: 1700000 },
  { id: 'in-yoon', name: '윤서아', expertise: ['핵심가치', '조직문화'], phone: '010-1000-0008', email: 'yoon@sam.com', defaultFee: 1400000 },
  { id: 'in-kang', name: '강태웅', expertise: ['리더십진단', '코칭'], phone: '010-1000-0009', defaultFee: 1900000, accountInfo: '농협 301-555-666' },
  { id: 'in-lim', name: '임수빈', expertise: ['신입', '온보딩'], phone: '010-1000-0010', defaultFee: 1000000 },
  { id: 'in-song', name: '송재호', expertise: ['AI웹앱', '노코드'], phone: '010-1000-0011', email: 'song@sam.com', defaultFee: 2000000, memo: 'AI Master Builder 메인 강사' },
  { id: 'in-bae', name: '배유진', expertise: ['퍼실리테이션', '워크숍'], phone: '010-1000-0012', defaultFee: 1350000 },
];
