'use client';

import React from 'react';
import { BarChart3, Upload, FileText, AlertTriangle } from 'lucide-react';

export function ScoringWelcome() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-purple-100 rounded-lg">
          <BarChart3 className="h-6 w-6 text-purple-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Scoring Mode</h2>
      </div>

      <p className="text-gray-600 mb-6">
        Upload a completed Guardian questionnaire to receive a comprehensive risk assessment
        with scores across all 10 dimensions.
      </p>

      <div className="space-y-4 mb-6">
        <div className="flex gap-3">
          <Upload className="h-5 w-5 text-gray-400 mt-0.5" />
          <div>
            <p className="font-medium text-gray-900">Upload completed questionnaire</p>
            <p className="text-sm text-gray-500">PDF recommended for best results</p>
          </div>
        </div>

        <div className="flex gap-3">
          <FileText className="h-5 w-5 text-gray-400 mt-0.5" />
          <div>
            <p className="font-medium text-gray-900">Receive detailed analysis</p>
            <p className="text-sm text-gray-500">Narrative report with evidence-based findings</p>
          </div>
        </div>

        <div className="flex gap-3">
          <BarChart3 className="h-5 w-5 text-gray-400 mt-0.5" />
          <div>
            <p className="font-medium text-gray-900">Get actionable scores</p>
            <p className="text-sm text-gray-500">10 risk dimensions with recommendations</p>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-amber-800">Important</p>
            <p className="text-sm text-amber-700">
              Only questionnaires exported from Guardian can be scored. The document must
              contain a valid Assessment ID in the header.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
