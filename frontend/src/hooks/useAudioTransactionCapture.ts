import { useState } from 'react';
import type { AxiosError } from 'axios';
import { aiAPI } from '../services/api';
import { formatMoney } from '../utils/money';
import type { TransactionType, PaymentMethod, ExpenseType } from '../types';
import type { TransactionFormData } from '../components/TransactionForm';

type ToastMessage = { message: string; type: 'success' | 'error' | 'warning' };

/**
 * Graba una nota de voz, la manda a Gemini (audio-to-txns) y arma un
 * TransactionFormData a partir de la primera transacción detectada.
 * No persiste nada — onExtracted es responsable de abrir el form de edición.
 */
export function useAudioTransactionCapture(onExtracted: (formData: TransactionFormData) => void, setToast: (toast: ToastMessage) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [processingAudio, setProcessingAudio] = useState(false);

  const processAudio = async (audioBlob: Blob) => {
    setProcessingAudio(true);
    try {
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
      });

      const audioBase64 = base64Audio.split(',')[1];

      const response = await aiAPI.audioToTransactions({
        audio_base64: audioBase64,
        audio_format: 'webm'
      });

      if (response.data.transactions && response.data.transactions.length > 0) {
        const firstTxn = response.data.transactions[0];
        onExtracted({
          description: firstTxn.description,
          // AI returns cents, use formatMoney for display
          amount: formatMoney(firstTxn.amount),
          transaction_type: firstTxn.transaction_type as TransactionType,
          payment_method: 'transfer' as PaymentMethod,
          date: new Date().toISOString().split('T')[0],
          category_id: firstTxn.category_id?.toString() || '',
          account_id: '',
          expense_type: 'variable' as ExpenseType,
          goal_id: '',
          beneficiary: '',
        });
        setToast({ message: 'Transacción extraída del audio', type: 'success' });
      } else {
        setToast({ message: 'No se detectaron transacciones en el audio', type: 'warning' });
      }
    } catch (error) {
      console.error('Error processing audio:', error);
      const detail = (error as AxiosError<{ detail?: string }>).response?.data?.detail || 'Error al procesar el audio con IA. Intenta de nuevo.';
      setToast({ message: detail, type: 'error' });
      setIsRecording(false);
    } finally {
      setProcessingAudio(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setToast({ message: 'Error al acceder al micrófono', type: 'error' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  return { isRecording, processingAudio, startRecording, stopRecording };
}
