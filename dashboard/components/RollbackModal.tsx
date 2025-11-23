import React, { useState } from 'react';

interface RollbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (step: number) => void;
}

export const RollbackModal: React.FC<RollbackModalProps> = ({ isOpen, onClose, onConfirm }) => {
    const [stepInput, setStepInput] = useState('');

    const handleConfirm = () => {
        const stepNum = parseInt(stepInput, 10);
        if (!isNaN(stepNum) && stepNum > 0) {
            onConfirm(stepNum);
            setStepInput('');
        } else {
            alert('Please enter a valid step number');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-md z-50">
            <div className="bg-gray-900 rounded-lg p-6 w-80 shadow-xl border border-white/10">
                <h2 className="text-lg font-bold mb-4 text-white">Rollback to Step</h2>
                <input
                    type="number"
                    min="1"
                    placeholder="Step number"
                    value={stepInput}
                    onChange={(e) => setStepInput(e.target.value)}
                    className="w-full p-2 mb-4 rounded bg-gray-800 text-white focus:outline-none"
                />
                <div className="flex justify-end space-x-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-200"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded text-sm text-white"
                    >
                        Rollback
                    </button>
                </div>
            </div>
        </div>
    );
};
