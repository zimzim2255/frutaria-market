/**
 * Invoice Generator Utility
 * Converts numbers to French text and generates invoice data
 */

// Convert numbers to French text
export const numberToFrenchText = (num: number): string => {
  const ones = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
  const teens = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante-dix', 'quatre-vingts', 'quatre-vingt-dix'];
  const scales = ['', 'mille', 'million', 'milliard', 'billion'];

  if (num === 0) return 'zéro';

  const convertHundreds = (n: number): string => {
    let result = '';
    
    const hundreds = Math.floor(n / 100);
    if (hundreds > 0) {
      result += ones[hundreds] + ' cent';
      if (hundreds > 1 && n % 100 === 0) result += 's';
      result += ' ';
    }

    const remainder = n % 100;
    if (remainder >= 20) {
      const ten = Math.floor(remainder / 10);
      const one = remainder % 10;
      result += tens[ten];
      if (one > 0) {
        if (ten === 8) result += '-';
        else result += '-';
        result += ones[one];
      }
    } else if (remainder >= 10) {
      result += teens[remainder - 10];
    } else if (remainder > 0) {
      result += ones[remainder];
    }

    return result.trim();
  };

  const parts: string[] = [];
  let scaleIndex = 0;

  while (num > 0) {
    const part = num % 1000;
    if (part > 0) {
      let partText = convertHundreds(part);
      if (scaleIndex > 0) {
        partText += ' ' + scales[scaleIndex];
        if (part > 1 && scaleIndex === 1) partText += 's'; // "mille" doesn't pluralize, but "million" does
      }
      parts.unshift(partText);
    }
    num = Math.floor(num / 1000);
    scaleIndex++;
  }

  return parts.join(' ').trim();
};

// Format amount in French (e.g., "Cent quarante-neuf dirhams et cinquante centimes")
export const formatAmountInFrench = (amount: number): string => {
  const dirhams = Math.floor(amount);
  const centimes = Math.round((amount - dirhams) * 100);

  let text = '';

  if (dirhams > 0) {
    text += numberToFrenchText(dirhams) + ' dirham';
    if (dirhams > 1) text += 's';
  }

  if (centimes > 0) {
    if (text) text += ' et ';
    text += numberToFrenchText(centimes) + ' centime';
    if (centimes > 1) text += 's';
  }

  if (!text) text = 'zéro dirham';

  // Capitalize first letter
  return text.charAt(0).toUpperCase() + text.slice(1);
};

// Generate invoice number
export const generateInvoiceNumber = (saleNumber: string): string => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `FAC-${year}${month}-${saleNumber}`;
};

// Format date in French
export const formatDateFrench = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  return d.toLocaleDateString('fr-FR', options);
};

// Invoice data structure
export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  status: 'Payée' | 'Non payée' | 'Partiellement payée';
  
  // Company info
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail?: string;
  companyICE?: string;
  companyIF?: string;
  companyRC?: string;
  companyPatente?: string;
  
  // Client info
  clientName: string;
  clientPhone: string;
  clientAddress: string;
  clientICE?: string;
  clientIF?: string;
  clientRC?: string;
  clientPatente?: string;
  
  // Products
  items: Array<{
    no: number;
    description: string;
    caisse: string;
    quantity: number;
    moyenne: string;
    unitPrice: number;
    subtotal: number;
  }>;
  
  // Totals
  totalHT: number;
  tva: number;
  totalTTC: number;
  amountInLetters: string;
  
  // Logo
  logoUrl?: string;
}

// Create invoice data from sale
export const createInvoiceFromSale = (sale: any, companyInfo: any): InvoiceData => {
  const items = (sale.sale_items || []).map((item: any, index: number) => ({
    no: index + 1,
    description: item.products?.name || 'Produit',
    caisse: '1', // Default, can be customized
    quantity: item.quantity || 1,
    moyenne: item.products?.unit || 'pcs',
    unitPrice: item.products?.sale_price || 0,
    subtotal: item.total_price || 0,
  }));

  const totalHT = items.reduce((sum: number, item: any) => sum + item.subtotal, 0);
  const tva = totalHT * 0.2; // 20% TVA
  const totalTTC = totalHT + tva;

  return {
    invoiceNumber: generateInvoiceNumber(sale.sale_number),
    date: formatDateFrench(sale.created_at),
    status: sale.payment_status === 'paid' ? 'Payée' : sale.payment_status === 'partial' ? 'Partiellement payée' : 'Non payée',
    
    companyName: companyInfo?.name || 'Frutaria Market',
    companyAddress: companyInfo?.address || 'Adresse non spécifiée',
    companyPhone: companyInfo?.phone || '+212 XXX XXX XXX',
    companyEmail: companyInfo?.email || 'contact@frutaria.com',
    companyICE: companyInfo?.ice || 'ICE non spécifié',
    companyIF: companyInfo?.if || '',
    companyRC: companyInfo?.rc || '',
    companyPatente: companyInfo?.patente || '',
    
    clientName: sale.stores?.name || 'Client',
    clientPhone: sale.stores?.phone || 'N/A',
    clientAddress: sale.stores?.address || 'Adresse non spécifiée',
    clientICE: sale.stores?.ice || '',
    clientIF: sale.stores?.if || '',
    clientRC: sale.stores?.rc || '',
    clientPatente: sale.stores?.patente || '',
    
    items,
    totalHT,
    tva,
    totalTTC,
    amountInLetters: formatAmountInFrench(totalTTC),
    logoUrl: '/logo.jpg',
  };
};
