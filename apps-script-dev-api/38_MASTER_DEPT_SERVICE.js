const QLTD_MASTER_DEPT_SOURCE = 'master_dept_v1';
const QLTD_MASTER_DEPT_CODES = [
  { deptCode: 'UBNCSP', deptName: 'Uy ban R&D', sortOrder: 10 },
  { deptCode: 'TROLY', deptName: 'Tro ly - Thu ky', sortOrder: 20 },
  { deptCode: 'PTDA', deptName: 'PTDA', sortOrder: 30 },
  { deptCode: 'GPMB', deptName: 'GPMB', sortOrder: 40 },
  { deptCode: 'TIEUCHUAN', deptName: 'Tieu chuan', sortOrder: 50 },
  { deptCode: 'BIM', deptName: 'BIM', sortOrder: 60 },
  { deptCode: 'THIETKE', deptName: 'Thiet ke ky thuat', sortOrder: 70 },
  { deptCode: 'KYTHUAT', deptName: 'Ky thuat', sortOrder: 80 },
  { deptCode: 'QLDA', deptName: 'QLDA', sortOrder: 90 },
  { deptCode: 'KEHOACH', deptName: 'Ke hoach', sortOrder: 100 },
  { deptCode: 'TAICHINH', deptName: 'Tai chinh', sortOrder: 110 },
  { deptCode: 'KETOAN', deptName: 'Ke toan', sortOrder: 120 },
  { deptCode: 'MKT', deptName: 'MKT - Truyen thong', sortOrder: 130 },
  { deptCode: 'KINHDOANH', deptName: 'Quan ly Kinh doanh', sortOrder: 140 },
  { deptCode: 'VANHANH', deptName: 'Quan ly & khai thac BDS', sortOrder: 150 },
  { deptCode: 'NHANSU', deptName: 'Nhan su', sortOrder: 160 },
  { deptCode: 'PHAPCHE', deptName: 'Phap che', sortOrder: 170 },
  { deptCode: 'CNTT', deptName: 'Quan tri he thong', sortOrder: 180 },
  { deptCode: 'HANHCHINH', deptName: 'Hanh chinh', sortOrder: 190 },
  { deptCode: 'DAUTHAU', deptName: 'Bo phan Dau thau', sortOrder: 200 }
];

const QLTD_MASTER_DEPT_ALIASES = {
  BQLDA: 'QLDA',
  'BAN QUAN LY DU AN': 'QLDA',
  QLDA: 'QLDA',
  'PHONG QUAN LY DU AN': 'QLDA',
  PTDA: 'PTDA',
  'PHONG PHAT TRIEN DU AN': 'PTDA',
  GPMB: 'GPMB',
  'PHONG GIAI PHONG MAT BANG': 'GPMB',
  THIETKE: 'THIETKE',
  'THIET KE': 'THIETKE',
  'THIET KE KY THUAT': 'THIETKE',
  'PHONG THIET KE KY THUAT': 'THIETKE',
  'PHONG CONCEPT': 'THIETKE',
  'PHONG KET CAU': 'THIETKE',
  TIEUCHUAN: 'TIEUCHUAN',
  'TIEU CHUAN': 'TIEUCHUAN',
  'PHONG TIEU CHUAN': 'TIEUCHUAN',
  DAUTHAU: 'DAUTHAU',
  'DAU THAU': 'DAUTHAU',
  'BO PHAN DAU THAU': 'DAUTHAU',
  'BP DAU THAU': 'DAUTHAU',
  KEHOACH: 'KEHOACH',
  'KE HOACH': 'KEHOACH',
  KHDT: 'KEHOACH',
  'PHONG KE HOACH': 'KEHOACH',
  KETOAN: 'KETOAN',
  'KE TOAN': 'KETOAN',
  'PHONG KE TOAN': 'KETOAN',
  KINHDOANH: 'KINHDOANH',
  'KINH DOANH': 'KINHDOANH',
  'QUAN LY KINH DOANH': 'KINHDOANH',
  'PHONG QUAN LY KINH DOANH': 'KINHDOANH',
  TAICHINH: 'TAICHINH',
  'TAI CHINH': 'TAICHINH',
  'PHONG TAI CHINH': 'TAICHINH',
  BIM: 'BIM',
  'PHONG BIM': 'BIM',
  KYTHUAT: 'KYTHUAT',
  'KY THUAT': 'KYTHUAT',
  KSXD: 'KYTHUAT',
  KTXD: 'KYTHUAT',
  'PHONG KIEM SOAT XAY DUNG': 'KYTHUAT',
  'KHOI XAY DUNG': 'KYTHUAT',
  NHANSU: 'NHANSU',
  'NHAN SU': 'NHANSU',
  'PHONG NHAN SU': 'NHANSU',
  PHAPCHE: 'PHAPCHE',
  'PHAP CHE': 'PHAPCHE',
  'PHONG PHAP CHE': 'PHAPCHE',
  HANHCHINH: 'HANHCHINH',
  'HANH CHINH': 'HANHCHINH',
  'PHONG HANH CHINH': 'HANHCHINH',
  CNTT: 'CNTT',
  'QUAN TRI HE THONG': 'CNTT',
  'PHONG QUAN TRI HE THONG': 'CNTT',
  'ENTIZ TECH': 'CNTT',
  MKT: 'MKT',
  MARKETING: 'MKT',
  'MKT TRUYEN THONG': 'MKT',
  'PHONG MKT TRUYEN THONG': 'MKT',
  VANHANH: 'VANHANH',
  'VAN HANH': 'VANHANH',
  'QUAN LY KHAI THAC BDS': 'VANHANH',
  'QUAN LY VA KHAI THAC BDS': 'VANHANH',
  'PHONG QUAN LY VA KHAI THAC BDS': 'VANHANH',
  UBNCSP: 'UBNCSP',
  'UY BAN R&D': 'UBNCSP',
  'UY BAN R D': 'UBNCSP',
  'VAN PHONG UY BAN R&D': 'UBNCSP',
  TROLY: 'TROLY',
  'TRO LY': 'TROLY',
  'TRO LY THU KY': 'TROLY',
  'BO PHAN TRO LY TGD': 'TROLY',
  'BO PHAN TRO LY HDQT': 'TROLY'
};

function qltdMasterDeptList_() {
  return QLTD_MASTER_DEPT_CODES.map(function(item) {
    return {
      deptCode: item.deptCode,
      deptName: item.deptName,
      sortOrder: item.sortOrder
    };
  });
}

function qltdMasterDeptCanonicalCode_(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const direct = raw.toUpperCase().replace(/\s+/g, '_');
  if (qltdMasterDeptExists_(direct)) return direct;
  const normalized = qltdMasterDeptNormalizeText_(raw);
  return QLTD_MASTER_DEPT_ALIASES[normalized] || '';
}

function qltdMasterDeptCanonicalCodeOrRaw_(value) {
  return qltdMasterDeptCanonicalCode_(value) || String(value || '').trim().toUpperCase();
}

function qltdMasterDeptName_(value) {
  const code = qltdMasterDeptCanonicalCode_(value);
  const found = QLTD_MASTER_DEPT_CODES.filter(function(item) {
    return item.deptCode === code;
  })[0];
  return found ? found.deptName : '';
}

function qltdMasterDeptExists_(code) {
  const normalized = String(code || '').trim().toUpperCase();
  return QLTD_MASTER_DEPT_CODES.some(function(item) {
    return item.deptCode === normalized;
  });
}

function qltdMasterDeptNormalizeText_(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0110/g, 'D')
    .replace(/\u0111/g, 'D')
    .replace(/&/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
